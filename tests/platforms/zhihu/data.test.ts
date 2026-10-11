/**
 * 知乎拿数据：快照怎么算（累计减今天、第一次多写前天、可选字段缺不补 0、账号数记在昨天）。
 * 额度、轮流和失败路径在 data-budget.test.ts。
 */
import { describe, expect, it } from "vitest";

import { createZhihuDataTool } from "../../../src/platforms/zhihu/data.js";
import type { DataPullOutcome } from "../../../src/platforms/types.js";
import {
  FakeZhihu,
  makePullContext,
  makeWork,
  type ContentStatsItem,
} from "./api-fixtures.js";

const YESTERDAY = "2026-10-08";
const DAY_BEFORE = "2026-10-07";

function pulled(outcome: DataPullOutcome) {
  if (!outcome.ok) throw new Error(`拉数据失败：${outcome.reason}`);
  return outcome.result;
}

/** 不带日期的一篇数（实测第 4 条）：Metrics 是到现在的累计，嵌 Today、Yesterday */
function seedWork(
  server: FakeZhihu,
  url: string,
  cumulative: Record<string, unknown>,
  spans: {
    today?: Record<string, unknown>;
    yesterday?: Record<string, unknown>;
  } = {},
): void {
  const row: ContentStatsItem = {
    ContentType: "article",
    ContentToken: "1",
    Url: url,
    Metrics: {
      ...cumulative,
      ...(spans.today === undefined ? {} : { Today: spans.today }),
      ...(spans.yesterday === undefined ? {} : { Yesterday: spans.yesterday }),
    },
  };
  server.cumulativeByUrl.set(url, [row]);
}

describe("知乎拿数据（快照）", () => {
  it("已是最新：lastSnapshotDay 已到昨天，不发任何请求（额度也不查）", async () => {
    const server = new FakeZhihu();
    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [makeWork("w1", "1")],
          fetch: server.fetch,
          lastSnapshotDay: YESTERDAY,
        }),
      ),
    );
    expect(server.requests).toEqual([]);
    expect(result.works).toEqual([]);
    expect(result.note).toContain("已经拉过");
  });

  it("第二天不误判「已是最新」：账号行记在昨天，昨天没盖住就照常拉", async () => {
    const server = new FakeZhihu();
    server.accountStats = {
      Followers: { Total: 10 },
      Metrics: { Yesterday: { ViewCount: 5 } },
    };
    seedWork(server, "https://zhuanlan.zhihu.com/p/1", { ViewCount: 6 });
    const work = { totals: { views: 5 }, totalsDay: YESTERDAY };
    // 同一天再拉：已是最新，0 次请求
    const again = new FakeZhihu();
    const sameDay = await createTool().pull(
      makePullContext({
        works: [makeWork("w1", "1", work)],
        today: "2026-10-09",
        lastSnapshotDay: YESTERDAY,
        fetch: again.fetch,
      }),
    );
    expect(again.requests).toEqual([]);
    expect(sameDay.ok && sameDay.result.note).toContain("已经拉过");
    // 第二天（10-10）：上次只拉到 10-08，昨天是 10-09，不会误判
    const nextDay = new FakeZhihu();
    nextDay.accountStats = server.accountStats;
    seedWork(nextDay, "https://zhuanlan.zhihu.com/p/1", { ViewCount: 6 });
    const second = pulled(
      await createTool().pull(
        makePullContext({
          works: [makeWork("w1", "1", work)],
          today: "2026-10-10",
          lastSnapshotDay: YESTERDAY,
          fetch: nextDay.fetch,
        }),
      ),
    );
    expect(nextDay.requests.length).toBeGreaterThan(0);
    expect(second.account).toEqual([
      { day: "2026-10-09", followers: 10, reads: 5 },
    ]);
  });

  it("平常一天：账号的粉丝和昨日阅读记在昨天；作品记累计减掉今天", async () => {
    const server = new FakeZhihu();
    server.accountStats = {
      Followers: { Total: 1234 },
      Metrics: { Yesterday: { ViewCount: 567, UpvoteCount: 8 } },
    };
    // 实测数字：累计 12071，今天 112 → 昨天收盘 11959
    seedWork(
      server,
      "https://zhuanlan.zhihu.com/p/1",
      {
        ViewCount: 12071,
        UpvoteCount: 66,
        CollectCount: 176,
        CommentCount: 28,
      },
      { today: { ViewCount: 112, UpvoteCount: 2 } },
    );

    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [
            makeWork("w1", "1", {
              totals: { views: 100 },
              totalsDay: DAY_BEFORE,
            }),
          ],
          fetch: server.fetch,
        }),
      ),
    );

    expect(result.account).toEqual([
      { day: YESTERDAY, followers: 1234, reads: 567 },
    ]);
    // Today 里没给的项（收藏、评论）照用累计
    expect(result.works).toEqual([
      {
        workId: "w1",
        day: YESTERDAY,
        totals: { views: 11959, likes: 64, collects: 176, comments: 28 },
      },
    ]);
  });

  it("可选字段没返回就不写这一项，不补 0", async () => {
    const server = new FakeZhihu();
    server.accountStats = { Followers: { Total: 10 } };
    seedWork(server, "https://zhuanlan.zhihu.com/p/1", { ViewCount: 5 });

    const result = pulled(
      await createTool().pull(
        makePullContext({
          works: [
            makeWork("w1", "1", {
              totals: { views: 5 },
              totalsDay: YESTERDAY,
            }),
          ],
          fetch: server.fetch,
        }),
      ),
    );

    // 账号没有昨日阅读（Metrics.Yesterday.ViewCount 缺）就整个不写
    expect(result.account).toEqual([{ day: YESTERDAY, followers: 10 }]);
    expect(result.works).toEqual([
      { workId: "w1", day: YESTERDAY, totals: { views: 5 } },
    ]);
  });

  it("第一次拉这篇：多写一条前天 = 昨天再减 Yesterday；已有快照的不写前天", async () => {
    const server = new FakeZhihu();
    server.accountStats = { Followers: { Total: 1 } };
    // 昨天 = 100 − 20 = 80；前天 = 80 − 30 = 50（点赞 Yesterday 没给就不减）
    seedWork(
      server,
      "https://zhuanlan.zhihu.com/p/1",
      { ViewCount: 100, UpvoteCount: 10 },
      {
        today: { ViewCount: 20, UpvoteCount: 2 },
        yesterday: { ViewCount: 30 },
      },
    );

    const first = pulled(
      await createTool().pull(
        makePullContext({ works: [makeWork("w1", "1")], fetch: server.fetch }),
      ),
    );
    expect(first.works).toEqual([
      { workId: "w1", day: DAY_BEFORE, totals: { views: 50, likes: 8 } },
      { workId: "w1", day: YESTERDAY, totals: { views: 80, likes: 8 } },
    ]);
    // 只发不带日期的请求，没有逐日补历史
    const asked = server.requests.filter(
      (request) => request.path === "/user/creator_content_stats",
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]?.query["StartDate"]).toBeUndefined();

    // 已有快照的只写昨天一条
    const server2 = new FakeZhihu();
    server2.accountStats = { Followers: { Total: 1 } };
    server2.cumulativeByUrl = server.cumulativeByUrl;
    const second = pulled(
      await createTool().pull(
        makePullContext({
          works: [
            makeWork("w1", "1", {
              totals: { views: 50 },
              totalsDay: DAY_BEFORE,
            }),
          ],
          fetch: server2.fetch,
        }),
      ),
    );
    expect(second.works).toEqual([
      { workId: "w1", day: YESTERDAY, totals: { views: 80, likes: 8 } },
    ]);
  });

  it("第一次拉这篇但减 Yesterday 出负数：前天那条不写，昨天照写", async () => {
    const server = new FakeZhihu();
    server.accountStats = { Followers: { Total: 1 } };
    // 昨天 = 100 − 20 = 80；前天 = 80 − 90 减出负数
    seedWork(
      server,
      "https://zhuanlan.zhihu.com/p/1",
      { ViewCount: 100 },
      { today: { ViewCount: 20 }, yesterday: { ViewCount: 90 } },
    );

    const result = pulled(
      await createTool().pull(
        makePullContext({ works: [makeWork("w1", "1")], fetch: server.fetch }),
      ),
    );
    expect(result.works).toEqual([
      { workId: "w1", day: YESTERDAY, totals: { views: 80 } },
    ]);
  });

  it("单篇请求用规范化后的 https 链接：作品存的原始链接带查询串也照常请求", async () => {
    const server = new FakeZhihu();
    server.accountStats = { Followers: { Total: 1 } };
    seedWork(server, "https://www.zhihu.com/answer/888", { ViewCount: 7 });

    await createTool().pull(
      makePullContext({
        works: [
          makeWork("w1", "1", {
            // 作品里存的是短链 + 查询串，不是规范化链接
            url: "http://www.zhihu.com/answer/888?utm_source=x",
            totals: { views: 7 },
            totalsDay: YESTERDAY,
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
});

function createTool() {
  return createZhihuDataTool();
}
