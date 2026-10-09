import { describe, expect, it } from "vitest";

import { MAX_REQUESTS_PER_PULL } from "../../../src/platforms/zhihu/data.js";
import { createZhihuDataTool } from "../../../src/platforms/zhihu/data.js";
import type { DataPullOutcome } from "../../../src/platforms/types.js";
import {
  ACCESS_SECRET,
  FakeZhihu,
  makePullContext,
  makeWork,
  type ContentStatsItem,
} from "./api-fixtures.js";

function pulled(outcome: DataPullOutcome) {
  if (!outcome.ok) throw new Error(`拉数据失败：${outcome.reason}`);
  return outcome.result;
}

/** 不带日期的响应：累计 + 可选 Today */
function cumulativeRow(
  totals: Record<string, unknown>,
  today?: Record<string, unknown>,
): ContentStatsItem[] {
  return [
    {
      ContentType: "article",
      ContentToken: "1",
      Url: "https://zhuanlan.zhihu.com/p/1",
      Metrics: { ...totals, ...(today ? { Today: today } : {}) },
    },
  ];
}

/** 带日期的响应：每天一条 */
function dailyRows(
  url: string,
  byDay: Record<string, Record<string, unknown>>,
): ContentStatsItem[] {
  return Object.entries(byDay).map(([day, totals]) => ({
    ContentType: "article",
    ContentToken: "1",
    Url: url,
    Metrics: { Date: day, ...totals },
  }));
}

/** 给假平台放一篇的数：不带日期回累计（截止昨天，Today 另给），带日期回每天一行 */
function seedWork(
  server: FakeZhihu,
  url: string,
  byDay: Record<string, Record<string, unknown>>,
  cumulative?: Record<string, unknown>,
  today?: Record<string, unknown>,
): void {
  const days = Object.keys(byDay).sort();
  const last = byDay[days[days.length - 1] ?? ""] ?? {};
  server.dailyByUrl.set(url, dailyRows(url, byDay));
  // 不带日期的累计行：截止昨天的总量（Today 给了就按给的）
  server.cumulativeByUrl.set(url, [
    ...cumulativeRow(cumulative ?? last, today ?? zeroed(last)),
  ]);
}

/** 把一天的数清零，当「今日」用 */
function zeroed(totals: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(totals).map((key) => [key, 0]));
}

describe("知乎拿数据", () => {
  it("已是最新：lastSnapshotDay 已到昨天，不发任何请求", async () => {
    const server = new FakeZhihu();

    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [makeWork("w1", "1")],
          fetch: server.fetch,
          lastSnapshotDay: "2026-10-08",
        }),
      ),
    );

    expect(server.requests).toEqual([]);
    expect(result.account).toEqual([]);
    expect(result.works).toEqual([]);
    expect(result.note).toContain("已经拉过");
  });

  it("账号行记在昨天：第二天不会误判「已是最新」，同一天再拉会跳过", async () => {
    // 第一天（10-09）拉：账号行写 10-08（数据属于哪天记哪天）
    const server = new FakeZhihu();
    server.accountStats = {
      Followers: { Total: 10 },
      Metrics: { Yesterday: { ViewCount: 5 } },
    };
    seedWork(server, "https://zhuanlan.zhihu.com/p/1", {
      "2026-10-08": { ViewCount: 5 },
    });

    const first = pulled(
      await createTool().pull(
        makePullContext({
          works: [
            makeWork("w1", "1", {
              totals: { views: 5 },
              totalsDay: "2026-10-08",
            }),
          ],
          today: "2026-10-09",
          fetch: server.fetch,
        }),
      ),
    );
    expect(first.account).toEqual([
      { day: "2026-10-08", followers: 10, reads: 5 },
    ]);

    // 同一天再拉：上次拉到的最后一天（10-08）就是昨天，已是最新，0 次请求
    const again = new FakeZhihu();
    const sameDay = await createTool().pull(
      makePullContext({
        works: [
          makeWork("w1", "1", {
            totals: { views: 5 },
            totalsDay: "2026-10-08",
          }),
        ],
        today: "2026-10-09",
        lastSnapshotDay: "2026-10-08",
        fetch: again.fetch,
      }),
    );
    expect(again.requests).toEqual([]);
    expect(sameDay.ok && sameDay.result.note).toContain("已经拉过");

    // 第二天（10-10）拉：上次只拉到 10-08，昨天是 10-09，不会误判已拉过
    const nextDay = new FakeZhihu();
    nextDay.accountStats = server.accountStats;
    seedWork(nextDay, "https://zhuanlan.zhihu.com/p/1", {
      "2026-10-09": { ViewCount: 6 },
    });
    const second = pulled(
      await createTool().pull(
        makePullContext({
          works: [
            makeWork("w1", "1", {
              totals: { views: 5 },
              totalsDay: "2026-10-08",
            }),
          ],
          today: "2026-10-10",
          lastSnapshotDay: "2026-10-08",
          fetch: nextDay.fetch,
        }),
      ),
    );
    expect(nextDay.requests.length).toBeGreaterThan(0);
    expect(second.account).toEqual([
      { day: "2026-10-09", followers: 10, reads: 5 },
    ]);
  });

  it("平常一天：账号数是昨天的，记在昨天；作品记昨天的累计", async () => {
    const server = new FakeZhihu();
    server.accountStats = {
      Followers: { Total: 1234, Increase: 2 },
      Metrics: { Yesterday: { ViewCount: 567, UpvoteCount: 8 } },
    };
    seedWork(server, "https://zhuanlan.zhihu.com/p/1", {
      "2026-10-05": { ViewCount: 10, UpvoteCount: 1 },
      "2026-10-08": { ViewCount: 100, UpvoteCount: 9 },
    });

    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [
            makeWork("w1", "1", {
              totals: { views: 10, likes: 1 },
              totalsDay: "2026-10-05",
            }),
          ],
          fetch: server.fetch,
        }),
      ),
    );

    expect(result.account).toEqual([
      { day: "2026-10-08", followers: 1234, reads: 567 },
    ]);
    // 有 totalsDay 就只补昨天一条：昨天收盘（今天 Today 为 0，不动累计）
    expect(result.works).toEqual([
      { workId: "w1", day: "2026-10-08", totals: { views: 100, likes: 9 } },
    ]);
  });

  it("单篇请求用规范化后的 https 链接：作品存的原始链接带查询串也照常请求", async () => {
    const server = new FakeZhihu();
    server.accountStats = { Followers: { Total: 1 } };
    seedWork(server, "https://www.zhihu.com/answer/888", {
      "2026-10-08": { ViewCount: 7 },
    });

    await createTool().pull(
      makePullContext({
        works: [
          makeWork("w1", "1", {
            // 作品里存的是短链 + 查询串，不是规范化链接
            url: "http://www.zhihu.com/answer/888?utm_source=x",
            totals: { views: 7 },
            totalsDay: "2026-10-08",
          }),
        ],
        fetch: server.fetch,
      }),
    );

    const asked = server.requests.find(
      (request) => request.path === "/user/creator_content_stats",
    );
    expect(asked?.query["ContentUrl"]).toBe("https://www.zhihu.com/answer/888");
  });

  it("可选字段没返回就不写这一项，不补 0", async () => {
    const server = new FakeZhihu();
    server.accountStats = { Followers: { Total: 10 } };
    seedWork(server, "https://zhuanlan.zhihu.com/p/1", {
      "2026-10-08": { ViewCount: 5 },
    });

    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [
            makeWork("w1", "1", {
              totals: { views: 5 },
              totalsDay: "2026-10-08",
            }),
          ],
          fetch: server.fetch,
        }),
      ),
    );

    expect(result.account).toEqual([{ day: "2026-10-08", followers: 10 }]);
    expect(result.works).toEqual([
      { workId: "w1", day: "2026-10-08", totals: { views: 5 } },
    ]);
  });

  it("没配密钥：照规格失败，不发请求", async () => {
    const server = new FakeZhihu();

    const outcome = await createTool().pull(
      makePullContext({
        works: [],
        fetch: server.fetch,
        secrets: { "access-secret": undefined },
      }),
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "开放平台密钥还没配",
      fixHint: "在账号详情 · 接入里填",
    });
    expect(server.requests).toEqual([]);
  });

  it("密钥不对：失败，把 access-secret 标成过期", async () => {
    const server = new FakeZhihu();
    server.intercept = () =>
      Response.json({ Code: 20001, Message: "bad secret", Data: null });

    const outcome = await createTool().pull(
      makePullContext({ works: [], fetch: server.fetch }),
    );

    expect(outcome).toMatchObject({
      ok: false,
      expiredKey: "access-secret",
    });
    if (!outcome.ok) expect(outcome.reason).not.toContain(ACCESS_SECRET);
  });

  it("整次失败不写半截：第 2 篇失败时，第 1 篇已拿到的数也不返回", async () => {
    const server = new FakeZhihu();
    seedWork(server, "https://zhuanlan.zhihu.com/p/1", {
      "2026-10-08": { ViewCount: 100 },
    });
    server.contents = [];

    let calls = 0;
    server.intercept = (request) => {
      if (request.path !== "/user/creator_content_stats")
        return Response.json({ Code: 0, Message: "success", Data: {} });
      calls += 1;
      if (calls === 1) return Response.json({ Code: 0, Data: { Items: [] } });
      return Response.json({ Code: 30001, Message: "quota", Data: null });
    };

    const outcome = await createTool().pull(
      makePullContext({
        works: [makeWork("w1", "1"), makeWork("w2", "2")],
        fetch: server.fetch,
      }),
    );

    expect(outcome.ok).toBe(false);
  });

  it("额度：超过 90 次请求就轮流，note 说明这次拉了几篇", async () => {
    const server = new FakeZhihu();
    const works = [];
    for (let index = 0; index < 50; index += 1) {
      const url = `https://zhuanlan.zhihu.com/p/${100 + index}`;
      // 每篇都从没记过、发布在窗口前 → 都要花 2 次请求（1 次累计 + 1 次补历史）
      seedWork(server, url, {
        "2026-09-01": { ViewCount: index },
        "2026-10-08": { ViewCount: index * 10 },
      });
      works.push(
        makeWork(`w${index}`, String(100 + index), {
          publishedAt: "2026-09-01",
        }),
      );
    }

    const result = pulled(
      await createTool().pull(makePullContext({ works, fetch: server.fetch })),
    );

    // 1 次账号 + 44 篇 × 2 次 = 89 次，第 45 篇起放不下
    expect(server.requests).toHaveLength(MAX_REQUESTS_PER_PULL - 1);
    expect(result.note).toContain("44");
    expect(result.note).toContain("6 篇");
  });

  it("补历史（每天一行的形状）：往回减出每天的收盘累计（规格数字例子）", async () => {
    const server = new FakeZhihu();
    server.accountStats = {};
    // 昨天累计 100；10-08 当天 5、10-07 当天 3 → 10-07 收盘 95、10-06 收盘 92
    seedWork(
      server,
      "https://zhuanlan.zhihu.com/p/1",
      {
        "2026-10-06": { ViewCount: 0 },
        "2026-10-07": { ViewCount: 3 },
        "2026-10-08": { ViewCount: 5 },
      },
      { ViewCount: 100 },
    );

    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [makeWork("w1", "1", { publishedAt: "2026-10-06" })],
          fetch: server.fetch,
        }),
      ),
    );

    expect(result.works).toEqual([
      { workId: "w1", day: "2026-10-06", totals: { views: 92 } },
      { workId: "w1", day: "2026-10-07", totals: { views: 95 } },
      { workId: "w1", day: "2026-10-08", totals: { views: 100 } },
    ]);
    // 补历史发了带起止日期的请求
    const dated = server.requests.find(
      (request) => request.query["StartDate"] !== undefined,
    );
    expect(dated?.query["StartDate"]).toBe("2026-10-06");
    expect(dated?.query["EndDate"]).toBe("2026-10-08");
  });

  it("补历史减出负数：数前后对不上，整次失败不写库", async () => {
    const server = new FakeZhihu();
    server.accountStats = {};
    // 累计 4，但 10-08 当天就有 5：往前减出负数
    seedWork(
      server,
      "https://zhuanlan.zhihu.com/p/1",
      {
        "2026-10-07": { ViewCount: 1 },
        "2026-10-08": { ViewCount: 5 },
      },
      { ViewCount: 4 },
    );

    const outcome = await createTool().pull(
      makePullContext({
        works: [makeWork("w1", "1", { publishedAt: "2026-10-07" })],
        fetch: server.fetch,
      }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("前后对不上");
  });

  it("补历史（整段合计的形状）：拆不出每天，只记昨天的快照，下次也不再补", async () => {
    const server = new FakeZhihu();
    server.accountStats = {};
    // 带日期只回一条合计（没有 Date）
    server.dailyByUrl.set("https://zhuanlan.zhihu.com/p/1", [
      {
        ContentType: "article",
        ContentToken: "1",
        Url: "https://zhuanlan.zhihu.com/p/1",
        Metrics: { ViewCount: 30 },
      },
    ]);
    server.cumulativeByUrl.set("https://zhuanlan.zhihu.com/p/1", [
      {
        ContentType: "article",
        ContentToken: "1",
        Url: "https://zhuanlan.zhihu.com/p/1",
        Metrics: { ViewCount: 30 },
      },
    ]);

    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [makeWork("w1", "1", { publishedAt: "2026-10-01" })],
          fetch: server.fetch,
        }),
      ),
    );

    expect(result.works).toEqual([
      { workId: "w1", day: "2026-10-08", totals: { views: 30 } },
    ]);
  });

  it("轮流：从没拉过的在前，最新拉过的这次轮空", async () => {
    const server = new FakeZhihu();
    server.accountStats = {};
    // 2 篇从没拉过 + 88 篇都拉到 10-05，预算只够再拉 88×1 + 2×1 = 90 - 1（账号） = 89
    const works = [];
    for (let index = 0; index < 90; index += 1) {
      const url = `https://zhuanlan.zhihu.com/p/${100 + index}`;
      seedWork(server, url, { "2026-10-08": { ViewCount: index } });
      works.push(
        makeWork(`w${index}`, String(100 + index), {
          totals: { views: index },
          totalsDay: index < 88 ? "2026-10-05" : undefined,
        }),
      );
    }

    await createTool().pull(makePullContext({ works, fetch: server.fetch }));

    // 总请求 90 次（1 账号 + 2 篇全新 × 2 次 + 85 篇 × 1 次）
    expect(server.requests).toHaveLength(MAX_REQUESTS_PER_PULL);
    const asked = new Set(
      server.requests
        .filter((request) => request.path === "/user/creator_content_stats")
        .map((request) =>
          request.query["ContentUrl"]?.replace(
            "https://zhuanlan.zhihu.com/p/",
            "",
          ),
        ),
    );
    // 两篇从没拉过的都拉了（优先级最高），其余 89 篇里这次只装得下 85 篇
    expect(asked.has("188")).toBe(true);
    expect(asked.has("189")).toBe(true);
    expect(asked.size).toBe(87);
  });

  it("进度回调：每篇一条，带序号和总数", async () => {
    const server = new FakeZhihu();
    seedWork(server, "https://zhuanlan.zhihu.com/p/1", {
      "2026-10-08": { ViewCount: 1 },
    });
    seedWork(server, "https://zhuanlan.zhihu.com/p/2", {
      "2026-10-08": { ViewCount: 2 },
    });
    const progress: string[] = [];

    await createTool().pull(
      makePullContext({
        works: [makeWork("w1", "1"), makeWork("w2", "2")],
        fetch: server.fetch,
        progress: (message) => progress.push(message),
      }),
    );

    expect(progress).toHaveLength(2);
    expect(progress[0]).toContain("1/2");
    expect(progress[1]).toContain("2/2");
  });
});

function createTool() {
  return createZhihuDataTool();
}
