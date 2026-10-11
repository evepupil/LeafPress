import { describe, expect, it } from "vitest";

import type { DayKey, WorkTotals } from "@leafpress/core";

import { createUmamiDataTool } from "../../../src/platforms/blog/umami/data.js";
import type {
  DataPullOutcome,
  DataPullResult,
} from "../../../src/platforms/types.js";
import {
  FakeUmami,
  SHARE_ID,
  SHARE_URL,
  SITE_URL,
  makeWork,
  makeContext,
  noSleep,
  type ContextOptions,
  type Traffic,
} from "./umami-fixtures.js";

type PullOptions = Omit<ContextOptions, "fetch">;

function pull(
  server: FakeUmami,
  options: PullOptions,
): Promise<DataPullOutcome> {
  return createUmamiDataTool({ sleep: noSleep }).pull(
    makeContext({ ...options, fetch: server.fetch }),
  );
}

function succeeded(outcome: DataPullOutcome): DataPullResult {
  if (!outcome.ok) throw new Error(`拉取失败：${outcome.reason}`);
  return outcome.result;
}

/** 作品编号 → 日期 → 那天的累计 */
function groupByWork(
  result: DataPullResult,
): Record<string, Record<DayKey, WorkTotals>> {
  const grouped: Record<string, Record<DayKey, WorkTotals>> = {};
  for (const snapshot of result.works) {
    const days = (grouped[snapshot.workId] ??= {});
    expect(
      days[snapshot.day],
      `${snapshot.workId} ${snapshot.day} 重复`,
    ).toBeUndefined();
    days[snapshot.day] = snapshot.totals;
  }
  return grouped;
}

/** 直接从访问表加出来的累计（和工具的倒推算法互相独立） */
function cumulativeOf(traffic: Traffic, path: string, day: DayKey): number {
  let total = 0;
  for (const [date, pages] of Object.entries(traffic)) {
    if (date > day) continue;
    const visit = pages[path];
    if (visit !== undefined)
      total += typeof visit === "number" ? visit : visit.pageviews;
  }
  return total;
}

/** 每个快照的访问数都等于从访问表直接加出来的累计 */
function expectSnapshotsAgree(
  traffic: Traffic,
  result: DataPullResult,
  paths: Record<string, string>,
): void {
  for (const snapshot of result.works) {
    const path = paths[snapshot.workId];
    expect(path, snapshot.workId).toBeDefined();
    expect(
      snapshot.totals["pageviews"],
      `${snapshot.workId} ${snapshot.day}`,
    ).toBe(cumulativeOf(traffic, path ?? "", snapshot.day));
  }
}

/** 五天的访问：a、b、c 三篇文章，另有首页、英文页和别的页面 */
const FIVE_DAYS: Traffic = {
  "2026-10-04": { "/": 3, "/posts/a/": 2 },
  "2026-10-05": { "/": 2, "/posts/a/": { pageviews: 3, visitors: 2 } },
  "2026-10-06": { "/posts/a/": 1, "/posts/b/": 4, "/en/posts/a/": 7 },
  "2026-10-07": { "/posts/b/": 2, "/posts/c/": 5, "/archives/": 1 },
  "2026-10-08": { "/posts/a/": 5, "/posts/b/": 3, "/posts/c/": 1 },
};
const FIVE_DAY_PATHS = {
  "b-1": "/posts/a/",
  "b-2": "/posts/b/",
  "b-3": "/posts/c/",
  "b-4": "/posts/d/",
};

function freshWorks() {
  return [
    makeWork("b-1", "a"),
    makeWork("b-2", "b"),
    makeWork("b-3", "c"),
    makeWork("b-4", "d"),
  ];
}

function requestedDays(
  server: FakeUmami,
  kind: "expanded" | "pageviews",
): string[] {
  return server
    .of(kind)
    .map((request) => `${request.firstDay}~${request.lastDay}`)
    .sort();
}

describe("没配、失效、配错", () => {
  it("没配共享链接：不发请求，提示去接入里填", async () => {
    const server = new FakeUmami({});

    const outcome = await pull(server, {
      works: [],
      secrets: { "umami-share": undefined },
    });

    expect(outcome).toEqual({
      ok: false,
      reason: "Umami 共享链接还没配",
      fixHint: "在账号详情 · 接入里填",
    });
    expect(server.requests).toEqual([]);
  });

  it("共享链接失效：让用例把它标成过期", async () => {
    const server = new FakeUmami({});
    server.shareStatus = 404;

    const outcome = await pull(server, { works: [] });

    expect(outcome).toEqual({
      ok: false,
      reason: "Umami 共享链接打不开了（可能被关掉或换了）",
      fixHint: "在 Umami 后台重新生成共享链接，填到接入里",
      expiredKey: "umami-share",
    });
  });

  it("共享链接的格式不对、站点地址的格式不对：写清原因，不标过期", async () => {
    const server = new FakeUmami({});

    const badShare = await pull(server, {
      works: [],
      secrets: { "umami-share": "https://umami.example.test/nothing" },
    });
    expect(badShare).toEqual({
      ok: false,
      reason: "Umami 共享链接的格式不对",
      fixHint: "在账号详情 · 接入里重新填共享链接",
    });

    const badSite = await pull(server, {
      works: [],
      settings: { "site-url": "blog.example.test" },
    });
    expect(badSite).toMatchObject({ ok: false, reason: "站点地址的格式不对" });
    expect(server.requests).toEqual([]);
  });

  it("其余失败写清原因，错误里没有共享编号和地址", async () => {
    const server = new FakeUmami({ "2026-10-08": { "/posts/a/": 1 } });
    server.intercept = (request) =>
      request.kind === "pageviews"
        ? new Response("", { status: 400 })
        : undefined;

    const outcome = await pull(server, { works: [] });

    expect(outcome).toEqual({
      ok: false,
      reason: "Umami 请求失败（HTTP 400）",
    });
    expect(JSON.stringify(outcome)).not.toContain(SHARE_ID);
  });
});

describe("补历史", () => {
  it("第一次拉（假数据 5 天）：逐天的累计都等于访问表加出来的，第一次非零的前一天有全 0 快照，昨天带访客", async () => {
    const server = new FakeUmami(FIVE_DAYS);

    const outcome = await pull(server, { works: freshWorks() });

    const result = succeeded(outcome);
    // 账号每天：全站当天的访问和访客（含首页、英文页、别的页面）；10-05 访问和访客不一样
    expect(result.account).toEqual([
      { day: "2026-10-04", followers: null, reads: 5, interactions: 5 },
      { day: "2026-10-05", followers: null, reads: 5, interactions: 4 },
      { day: "2026-10-06", followers: null, reads: 12, interactions: 12 },
      { day: "2026-10-07", followers: null, reads: 8, interactions: 8 },
      { day: "2026-10-08", followers: null, reads: 9, interactions: 9 },
    ]);
    expect(groupByWork(result)).toEqual({
      // a 从起点就有访问，起点之前全站没有访问：起点前一天补全 0
      "b-1": {
        "2026-10-03": { pageviews: 0, visitors: 0 },
        "2026-10-04": { pageviews: 2 },
        "2026-10-05": { pageviews: 5 },
        "2026-10-06": { pageviews: 6 },
        "2026-10-07": { pageviews: 6 },
        "2026-10-08": { pageviews: 11, visitors: 10 },
      },
      "b-2": {
        "2026-10-05": { pageviews: 0, visitors: 0 },
        "2026-10-06": { pageviews: 4 },
        "2026-10-07": { pageviews: 6 },
        "2026-10-08": { pageviews: 9, visitors: 9 },
      },
      "b-3": {
        "2026-10-06": { pageviews: 0, visitors: 0 },
        "2026-10-07": { pageviews: 5 },
        "2026-10-08": { pageviews: 6, visitors: 6 },
      },
      // d 一直没有访问：昨天记一条 0，让它有累计数据，下次不用再为它补历史
      "b-4": {
        "2026-10-08": { pageviews: 0, visitors: 0 },
      },
    });
    expectSnapshotsAgree(FIVE_DAYS, result, FIVE_DAY_PATHS);
    expect(result.note).toBe("入库 4 篇文章，补了 5 天历史");
  });

  it("逐天核对：累计 = 昨天累计减后面每天的单日访问", async () => {
    const server = new FakeUmami(FIVE_DAYS);

    const result = succeeded(await pull(server, { works: freshWorks() }));

    const days = groupByWork(result)["b-1"] ?? {};
    const yesterdayTotal = days["2026-10-08"]?.["pageviews"] ?? -1;
    const dailyOfA = {
      "2026-10-05": 3,
      "2026-10-06": 1,
      "2026-10-07": 0,
      "2026-10-08": 5,
    };
    let later = 0;
    for (const day of [
      "2026-10-08",
      "2026-10-07",
      "2026-10-06",
      "2026-10-05",
      "2026-10-04",
    ]) {
      expect(days[day]?.["pageviews"], day).toBe(yesterdayTotal - later);
      later += dailyOfA[day as keyof typeof dailyOfA] ?? 0;
    }
  });

  it("规格里的例子：10/8 累计 100，10/8 当天 5、10/7 当天 3 → 10/7 累计 95、10/6 累计 92", async () => {
    const traffic: Traffic = {
      "2026-10-06": { "/posts/a/": 92 },
      "2026-10-07": { "/posts/a/": 3 },
      "2026-10-08": { "/posts/a/": 5 },
    };
    const server = new FakeUmami(traffic);

    const result = succeeded(
      await pull(server, { works: [makeWork("b-1", "a")] }),
    );

    expect(groupByWork(result)["b-1"]).toEqual({
      "2026-10-05": { pageviews: 0, visitors: 0 },
      "2026-10-06": { pageviews: 92 },
      "2026-10-07": { pageviews: 95 },
      "2026-10-08": { pageviews: 100, visitors: 100 },
    });
    // 单日请求只问「起点后一天到昨天」
    expect(requestedDays(server, "expanded")).toEqual([
      "2000-01-01~2026-10-08",
      "2026-10-07~2026-10-07",
      "2026-10-08~2026-10-08",
    ]);
  });

  it("补历史的请求：取令牌、一次日序列、一次全量累计，再每天一次单日（起点后一天到昨天）", async () => {
    const server = new FakeUmami(FIVE_DAYS);

    await pull(server, { works: freshWorks() });

    expect(server.of("share")).toHaveLength(1);
    expect(requestedDays(server, "pageviews")).toEqual([
      "2026-04-10~2026-10-08",
    ]);
    expect(requestedDays(server, "expanded")).toEqual([
      "2000-01-01~2026-10-08",
      "2026-10-05~2026-10-05",
      "2026-10-06~2026-10-06",
      "2026-10-07~2026-10-07",
      "2026-10-08~2026-10-08",
    ]);
    expect(server.requests).toHaveLength(1 + 1 + 1 + 4);
  });

  it("起点是半年窗口和全站第一天有数据的日期里较晚的那个", async () => {
    // 窗口第一天是 2026-04-10；数据从 04-20 才有
    const traffic: Traffic = {
      "2026-04-20": { "/posts/a/": 2 },
      "2026-10-08": { "/posts/a/": 1 },
    };
    const server = new FakeUmami(traffic);

    const result = succeeded(
      await pull(server, { works: [makeWork("b-1", "a")] }),
    );

    expect(result.account[0]).toEqual({
      day: "2026-04-20",
      followers: null,
      reads: 2,
      interactions: 2,
    });
    expect(result.account).toHaveLength(172);
    expect(result.account[result.account.length - 1]?.day).toBe("2026-10-08");
    expect(result.note).toBe("入库 1 篇文章，补了 172 天历史");
  });

  it("没有访问数据：已是最新，什么都不写", async () => {
    const server = new FakeUmami({});

    const outcome = await pull(server, { works: freshWorks() });

    expect(outcome).toEqual({
      ok: true,
      result: { account: [], works: [], note: "已是最新" },
    });
  });

  it("起点之前全站已经有访问：起点那天就有累计的作品不补全 0 快照，免得把攒下的访问全算成起点当天新增", async () => {
    const traffic: Traffic = {
      "2026-03-30": { "/posts/old/": 40, "/": 5 },
      "2026-04-12": { "/posts/old/": 2, "/posts/new/": 1 },
      "2026-10-08": { "/posts/old/": 3, "/posts/new/": 1 },
    };
    const server = new FakeUmami(traffic);

    const result = succeeded(
      await pull(server, {
        works: [makeWork("b-1", "old"), makeWork("b-2", "new")],
      }),
    );

    const grouped = groupByWork(result);
    expect(Object.keys(grouped["b-1"] ?? {}).sort()[0]).toBe("2026-04-12");
    expect(grouped["b-1"]?.["2026-04-12"]).toEqual({ pageviews: 42 });
    expect(Object.keys(grouped["b-2"] ?? {}).sort()[0]).toBe("2026-04-12");
    expect(grouped["b-1"]?.["2026-10-08"]).toEqual({
      pageviews: 45,
      visitors: 45,
    });
    expectSnapshotsAgree(traffic, result, {
      "b-1": "/posts/old/",
      "b-2": "/posts/new/",
    });
  });

  it("补历史时每 10 天报一次进度", async () => {
    const traffic: Traffic = {};
    for (let day = 14; day <= 30; day += 1)
      traffic[`2026-09-${String(day)}`] = { "/posts/a/": 1 };
    for (let day = 1; day <= 8; day += 1)
      traffic[`2026-10-0${String(day)}`] = { "/posts/a/": 1 };
    const server = new FakeUmami(traffic);
    const messages: string[] = [];

    const result = succeeded(
      await pull(server, {
        works: [makeWork("b-1", "a")],
        progress: (message) => messages.push(message),
      }),
    );

    expect(result.account).toHaveLength(25);
    expect(messages).toEqual(["补历史：第 10/25 天", "补历史：第 20/25 天"]);
  });
});

describe("平常拉", () => {
  const stored = (day: DayKey, pageviews: number) => ({ day, pageviews });

  it("平常一天：账号每天覆盖整个窗口并带访客，作品只查昨天；3 次请求（取令牌、日序列、全量累计），没有单日请求", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: stored("2026-10-07", 6) }),
      makeWork("b-2", "b", { totals: stored("2026-10-07", 6) }),
      makeWork("b-3", "c", { totals: stored("2026-10-07", 5) }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    // 账号每天：从全站第一天有数据的 10-04 到昨天一天不缺，以前拉过的日子重写一遍，把访客补上
    expect(result.account).toEqual([
      { day: "2026-10-04", followers: null, reads: 5, interactions: 5 },
      { day: "2026-10-05", followers: null, reads: 5, interactions: 4 },
      { day: "2026-10-06", followers: null, reads: 12, interactions: 12 },
      { day: "2026-10-07", followers: null, reads: 8, interactions: 8 },
      { day: "2026-10-08", followers: null, reads: 9, interactions: 9 },
    ]);
    expect(groupByWork(result)).toEqual({
      "b-1": { "2026-10-08": { pageviews: 11, visitors: 10 } },
      "b-2": { "2026-10-08": { pageviews: 9, visitors: 9 } },
      "b-3": { "2026-10-08": { pageviews: 6, visitors: 6 } },
    });
    expect(result.note).toBe("入库 3 篇文章");
    expect(server.requests).toHaveLength(3);
    expect(requestedDays(server, "pageviews")).toEqual([
      "2026-04-10~2026-10-08",
    ]);
    expect(requestedDays(server, "expanded")).toEqual([
      "2000-01-01~2026-10-08",
    ]);
  });

  it("漏了 3 天：补 3 天，单日请求只问起点后一天到昨天；起点那天就有累计的不补全 0", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: stored("2026-10-05", 5) }),
      makeWork("b-2", "b", { totals: stored("2026-10-05", 0) }),
      makeWork("b-3", "c", { totals: stored("2026-10-05", 0) }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-05" }),
    );

    expect(result.account.map((row) => row.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expect(groupByWork(result)).toEqual({
      "b-1": {
        "2026-10-06": { pageviews: 6 },
        "2026-10-07": { pageviews: 6 },
        "2026-10-08": { pageviews: 11, visitors: 10 },
      },
      // b 从起点那天（10-06）就有访问：前一天是上次拉过的，不再写
      "b-2": {
        "2026-10-06": { pageviews: 4 },
        "2026-10-07": { pageviews: 6 },
        "2026-10-08": { pageviews: 9, visitors: 9 },
      },
      // c 在范围内才第一次有访问：前一天写全 0
      "b-3": {
        "2026-10-06": { pageviews: 0, visitors: 0 },
        "2026-10-07": { pageviews: 5 },
        "2026-10-08": { pageviews: 6, visitors: 6 },
      },
    });
    expectSnapshotsAgree(FIVE_DAYS, result, FIVE_DAY_PATHS);
    expect(requestedDays(server, "expanded")).toEqual([
      "2000-01-01~2026-10-08",
      "2026-10-07~2026-10-07",
      "2026-10-08~2026-10-08",
    ]);
    expect(result.note).toBe("入库 3 篇文章");
  });

  it("账号里有刚导入的作品（还没有任何累计数据）：退回补历史，其余作品一并重算", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: stored("2026-10-07", 6) }),
      makeWork("b-2", "b", { totals: stored("2026-10-07", 6) }),
      makeWork("b-3", "c"),
    ];
    const messages: string[] = [];

    const result = succeeded(
      await pull(server, {
        works,
        lastSnapshotDay: "2026-10-07",
        progress: (message) => messages.push(message),
      }),
    );

    expect(result.account.map((row) => row.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    const grouped = groupByWork(result);
    // 新作品从没写过：起点之前全站没访问，第一次非零的前一天补全 0
    expect(grouped["b-3"]).toEqual({
      "2026-10-06": { pageviews: 0, visitors: 0 },
      "2026-10-07": { pageviews: 5 },
      "2026-10-08": { pageviews: 6, visitors: 6 },
    });
    // 已有数据的作品：起点那天（10-04）就有访问，前一天不动
    expect(Object.keys(grouped["b-1"] ?? {}).sort()[0]).toBe("2026-10-04");
    expectSnapshotsAgree(FIVE_DAYS, result, FIVE_DAY_PATHS);
    expect(result.note).toBe("入库 3 篇文章，补了 5 天历史");
    expect(messages).toEqual([]);
  });

  it("账号里的作品链接对不上本站文章（没有链接、英文地址、别的站）不触发补历史", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: stored("2026-10-07", 6) }),
      { ...makeWork("b-2", "x"), url: undefined },
      makeWork("b-3", "y", { url: `${SITE_URL}/en/posts/y/` }),
      makeWork("b-4", "z", { url: "https://elsewhere.example.test/posts/z/" }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(result.account.map((row) => row.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expect(Object.keys(groupByWork(result))).toEqual(["b-1"]);
  });

  it("账号每天的第二个数：同一次日序列返回里的会话数（访客），不多发请求；访问和访客可以对不上", async () => {
    // 10-08 三次访问只来自两个访客
    const traffic: Traffic = {
      "2026-10-07": { "/posts/a/": 3 },
      "2026-10-08": { "/posts/a/": { pageviews: 3, visitors: 2 } },
    };
    const server = new FakeUmami(traffic);
    const works = [makeWork("b-1", "a", { totals: stored("2026-10-06", 0) })];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-06" }),
    );

    // 账号每天覆盖整个窗口，10-07、10-08 都在；只有一次日序列请求（加上取令牌和全量累计，共 3 次）
    expect(result.account).toEqual([
      { day: "2026-10-07", followers: null, reads: 3, interactions: 3 },
      { day: "2026-10-08", followers: null, reads: 3, interactions: 2 },
    ]);
    // 只有一次日序列请求（加上取令牌和全量累计，共 3 次）
    expect(server.of("pageviews")).toHaveLength(1);
  });

  it("日序列没给某天的会话数：那天的第二个数是 null；有访问但接口没发会话序列时也一样", async () => {
    const traffic: Traffic = {
      "2026-10-07": { "/": 3 },
      "2026-10-08": { "/posts/a/": 1 },
    };
    const works = [makeWork("b-1", "a", { totals: stored("2026-10-06", 0) })];

    // 接口只在有访客数可给的日子发会话行：10-07 那天没有
    const partial = new FakeUmami(traffic);
    partial.intercept = (request) =>
      request.kind === "pageviews"
        ? Response.json({
            pageviews: [
              { x: "2026-10-07T00:00:00Z", y: 3 },
              { x: "2026-10-08T00:00:00Z", y: 1 },
            ],
            sessions: [{ x: "2026-10-08T00:00:00Z", y: 1 }],
          })
        : undefined;
    const partialResult = succeeded(
      await pull(partial, { works, lastSnapshotDay: "2026-10-06" }),
    );
    expect(partialResult.account).toEqual([
      { day: "2026-10-07", followers: null, reads: 3, interactions: null },
      { day: "2026-10-08", followers: null, reads: 1, interactions: 1 },
    ]);

    // 返回体里干脆没有 sessions 序列：有访问的日子也写 null
    const missing = new FakeUmami(traffic);
    missing.intercept = (request) =>
      request.kind === "pageviews"
        ? Response.json({
            pageviews: [
              { x: "2026-10-07T00:00:00Z", y: 3 },
              { x: "2026-10-08T00:00:00Z", y: 1 },
            ],
          })
        : undefined;
    const missingResult = succeeded(
      await pull(missing, { works, lastSnapshotDay: "2026-10-06" }),
    );
    expect(missingResult.account).toEqual([
      { day: "2026-10-07", followers: null, reads: 3, interactions: null },
      { day: "2026-10-08", followers: null, reads: 1, interactions: null },
    ]);
  });

  it("已是最新：上次已经拉到昨天，什么都不写，也不发请求", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [makeWork("b-1", "a", { totals: stored("2026-10-08", 11) })];

    const outcome = await pull(server, {
      works,
      lastSnapshotDay: "2026-10-08",
    });

    expect(outcome).toEqual({
      ok: true,
      result: { account: [], works: [], note: "已是最新" },
    });
    expect(server.requests).toEqual([]);
  });

  it("上次拉到的日子太久远（超出半年窗口）：从窗口第一天算，不去拉用不上的旧日子", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [makeWork("b-1", "a", { totals: stored("2025-01-01", 1) })];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2025-01-01" }),
    );

    expect(requestedDays(server, "pageviews")).toEqual([
      "2026-04-10~2026-10-08",
    ]);
    // 账号每天从全站第一天有数据的 10-04 起（之前的窗口没有访问，不写）
    expect(result.account[0]?.day).toBe("2026-10-04");
    expect(result.account).toHaveLength(5);
    expect(result.account.find((row) => row.day === "2026-10-08")?.reads).toBe(
      9,
    );
    expect(result.account.find((row) => row.day === "2026-10-05")?.reads).toBe(
      5,
    );
  });

  it("没有对得上的作品：只拉账号每天，不查路径", async () => {
    const server = new FakeUmami(FIVE_DAYS);

    const result = succeeded(
      await pull(server, { works: [], lastSnapshotDay: "2026-10-05" }),
    );

    // 没有作品也照旧：账号每天覆盖整个窗口（从全站第一天有数据的 10-04 起）
    expect(result.account.map((row) => row.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expect(result.works).toEqual([]);
    expect(server.of("expanded")).toEqual([]);
    expect(result.note).toBe("入库 0 篇文章");
  });
});

describe("路径对作品", () => {
  it("规范化：无结尾斜杠、锚点、查询串、中文 slug 的编码和解码两种写法合并，原始重复行只算一次；英文地址和别的页面不计", async () => {
    const traffic: Traffic = {
      "2026-10-08": {
        "/posts/a": 3,
        "/posts/a/#intro": 2,
        "/posts/a/?utm_source=x": 1,
        "/posts/%E4%B8%AD%E6%96%87/": 4,
        "/posts/中文": 5,
        "/en/posts/a/": 50,
        "/posts/": 20,
      },
    };
    const server = new FakeUmami(traffic);
    server.intercept = (request) => {
      if (request.kind !== "expanded") return undefined;
      const rows = [
        ...server.sums(request.firstDay ?? "", request.lastDay ?? ""),
      ].map(([name, value]) => ({
        name,
        pageviews: value.pageviews,
        visitors: value.visitors,
        visits: value.pageviews,
        bounces: 0,
        totaltime: 0,
      }));
      // 同一行出现两次（分页重行）
      return Response.json([...rows, rows[0]]);
    };
    const works = [
      makeWork("b-1", "a"),
      makeWork("b-2", "中文"),
      makeWork("b-3", "x", { url: `${SITE_URL}/posts/%E4%B8%AD%E6%96%87/` }),
    ];

    const result = succeeded(await pull(server, { works }));

    const grouped = groupByWork(result);
    expect(grouped["b-1"]?.["2026-10-08"]).toEqual({
      pageviews: 6,
      visitors: 6,
    });
    expect(grouped["b-2"]?.["2026-10-08"]).toEqual({
      pageviews: 9,
      visitors: 9,
    });
    expect(grouped["b-3"]?.["2026-10-08"]).toEqual({
      pageviews: 9,
      visitors: 9,
    });
    // 账号每天仍是全站访问和访客：英文页和别的页面算进去
    expect(result.account).toEqual([
      { day: "2026-10-08", followers: null, reads: 85, interactions: 85 },
    ]);
  });

  it("没配站点地址：按路径对作品；配了站点地址：别的站的链接不计", async () => {
    const traffic: Traffic = {
      "2026-10-08": { "/posts/a/": 3, "/posts/b/": 4 },
    };
    const works = [
      makeWork("b-1", "a"),
      makeWork("b-2", "b", { url: "https://elsewhere.example.test/posts/b/" }),
    ];

    const withSite = succeeded(await pull(new FakeUmami(traffic), { works }));
    expect(Object.keys(groupByWork(withSite))).toEqual(["b-1"]);

    const withoutSite = succeeded(
      await pull(new FakeUmami(traffic), {
        works,
        settings: { "site-url": undefined },
      }),
    );
    expect(Object.keys(groupByWork(withoutSite)).sort()).toEqual([
      "b-1",
      "b-2",
    ]);
  });
});

describe("数据对不上、被清、中途失败", () => {
  it("单日访问比累计还多（累计倒推成负数）：整次失败，不返回半截数据", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    server.intercept = (request) =>
      request.kind === "expanded" &&
      request.firstDay === "2026-10-07" &&
      request.lastDay === "2026-10-07"
        ? Response.json([
            {
              name: "/posts/b/",
              pageviews: 1000,
              visitors: 5,
              visits: 5,
              bounces: 0,
              totaltime: 0,
            },
          ])
        : undefined;

    const outcome = await pull(server, { works: freshWorks() });

    expect(outcome).toEqual({
      ok: false,
      reason: "Umami 的数前后对不上，这次没入库",
    });
    expect(outcome).not.toHaveProperty("result");
  });

  it("单日访问是负数（累计按日期下降）：整次失败", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    server.intercept = (request) =>
      request.kind === "expanded" &&
      request.firstDay === "2026-10-08" &&
      request.lastDay === "2026-10-08"
        ? Response.json([
            {
              name: "/posts/a/",
              pageviews: -2,
              visitors: 1,
              visits: 1,
              bounces: 0,
              totaltime: 0,
            },
          ])
        : undefined;

    const outcome = await pull(server, { works: freshWorks() });

    expect(outcome).toMatchObject({
      ok: false,
      reason: "Umami 的数前后对不上，这次没入库",
    });
  });

  it("Umami 清掉旧数据、昨天的累计比记录库里现有的还小：这篇这次不写，note 里说明；别的篇照写", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: { day: "2026-10-07", pageviews: 500 } }),
      makeWork("b-2", "b", { totals: { day: "2026-10-07", pageviews: 6 } }),
      // 相等不算变小，照写
      makeWork("b-3", "c", { totals: { day: "2026-10-07", pageviews: 6 } }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(Object.keys(groupByWork(result)).sort()).toEqual(["b-2", "b-3"]);
    expect(result.note).toBe(
      "入库 2 篇文章；1 篇文章的访问数比已有记录小（Umami 可能清掉了旧数据，或文章地址改过），这次没覆盖：b-1",
    );
  });

  it("中途有一步一直失败：整次失败，写清原因，没有半截数据", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    server.intercept = (request) =>
      request.kind === "expanded" &&
      request.firstDay === "2026-10-06" &&
      request.lastDay === "2026-10-06"
        ? new Response("boom", { status: 500 })
        : undefined;

    const outcome = await pull(server, { works: freshWorks() });

    expect(outcome).toEqual({
      ok: false,
      reason: "Umami 服务暂时不可用（HTTP 500）",
    });
  });

  it("失败原因里没有共享链接和共享编号", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    server.intercept = (request) =>
      request.kind === "expanded"
        ? new Response("x", { status: 418 })
        : undefined;

    const outcome = await pull(server, { works: freshWorks() });

    expect(outcome.ok).toBe(false);
    const text = JSON.stringify(outcome);
    expect(text).not.toContain(SHARE_ID);
    expect(text).not.toContain(SHARE_URL);
    expect(text).not.toContain("umami.example.test");
  });
});

describe("没有访问的作品", () => {
  /** 站点有访问，但只在首页：文章都没人看 */
  const ONLY_HOME: Traffic = {
    "2026-10-04": { "/": 2 },
    "2026-10-08": { "/": 4 },
  };

  it("补历史：查不到访问的作品昨天记一条 0，往前不用查；说明里算上它", async () => {
    const server = new FakeUmami(ONLY_HOME);

    const result = succeeded(
      await pull(server, {
        works: [makeWork("b-1", "a"), makeWork("b-2", "b")],
      }),
    );

    expect(groupByWork(result)).toEqual({
      "b-1": { "2026-10-08": { pageviews: 0, visitors: 0 } },
      "b-2": { "2026-10-08": { pageviews: 0, visitors: 0 } },
    });
    expect(result.account.map((row) => row.day)).toHaveLength(5);
    expect(result.note).toBe("入库 2 篇文章，补了 5 天历史");
    // 累计是 0，往前也全是 0：不发单日请求
    expect(requestedDays(server, "expanded")).toEqual([
      "2000-01-01~2026-10-08",
    ]);
  });

  it("有访问的作品照旧倒推历史，没访问的只记昨天一条 0", async () => {
    const server = new FakeUmami(FIVE_DAYS);

    const result = succeeded(await pull(server, { works: freshWorks() }));

    expect(groupByWork(result)["b-4"]).toEqual({
      "2026-10-08": { pageviews: 0, visitors: 0 },
    });
    expect(Object.keys(groupByWork(result)["b-1"] ?? {})).toHaveLength(6);
  });

  it("记过 0 的作品有了累计数据：下次平常拉，只要 3 次请求，不再退回补历史；还没人看就再记一条昨天的 0", async () => {
    const server = new FakeUmami(ONLY_HOME);
    const works = [
      makeWork("b-1", "a", { totals: { day: "2026-10-07", pageviews: 0 } }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(server.requests).toHaveLength(3);
    // 账号每天覆盖整个窗口（从全站第一天有数据的 10-04 起），把以前拉过、还没有的访客补上；
    // 中间没访问的日子也照写（访问 0、访客 0）
    const days = result.account.map((row) => row.day);
    expect(days[0]).toBe("2026-10-04");
    expect(days[days.length - 1]).toBe("2026-10-08");
    expect(days).toHaveLength(5);
    expect(result.account[0]).toEqual({
      day: "2026-10-04",
      followers: null,
      reads: 2,
      interactions: 2,
    });
    expect(result.account[days.length - 1]).toEqual({
      day: "2026-10-08",
      followers: null,
      reads: 4,
      interactions: 4,
    });
    expect(groupByWork(result)).toEqual({
      "b-1": { "2026-10-08": { pageviews: 0, visitors: 0 } },
    });
    expect(result.note).toBe("入库 1 篇文章");
  });

  it("作品已有的累计比 0 大（文章地址可能改过）：这次不写，说明里写出编号", async () => {
    const server = new FakeUmami(ONLY_HOME);
    const works = [
      makeWork("b-1", "moved", { totals: { day: "2026-10-07", pageviews: 7 } }),
      makeWork("b-2", "never", { totals: { day: "2026-10-07", pageviews: 0 } }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(Object.keys(groupByWork(result))).toEqual(["b-2"]);
    expect(result.note).toBe(
      "入库 1 篇文章；1 篇文章的访问数比已有记录小（Umami 可能清掉了旧数据，或文章地址改过），这次没覆盖：b-1",
    );
  });

  it("不是本站中文文章地址的作品不记 0（没链接、英文地址、别的站）", async () => {
    const server = new FakeUmami(ONLY_HOME);
    const works = [
      { ...makeWork("b-1", "x"), url: undefined },
      makeWork("b-2", "y", { url: `${SITE_URL}/en/posts/y/` }),
      makeWork("b-3", "z", { url: "https://elsewhere.example.test/posts/z/" }),
      makeWork("b-4", "w", { totals: { day: "2026-10-07", pageviews: 0 } }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(Object.keys(groupByWork(result))).toEqual(["b-4"]);
  });
});

describe("补历史的起点按发布日期", () => {
  it("只有一篇三天前发布的新作品没数据：单日请求只覆盖这几天", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: { day: "2026-10-07", pageviews: 6 } }),
      makeWork("b-2", "b", { totals: { day: "2026-10-07", pageviews: 6 } }),
      // 今天是 10-09，三天前是 10-06
      makeWork("b-3", "c", { publishedAt: "2026-10-06" }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    // 起点是发布日期的前一天 10-05；作品快照从那天接上，账号每天从全站第一天有数据的 10-04 覆盖整个窗口
    expect(result.account.map((row) => row.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expect(requestedDays(server, "expanded")).toEqual([
      "2000-01-01~2026-10-08",
      "2026-10-06~2026-10-06",
      "2026-10-07~2026-10-07",
      "2026-10-08~2026-10-08",
    ]);
    expect(server.requests).toHaveLength(1 + 1 + 1 + 3);
    expect(groupByWork(result)["b-3"]).toEqual({
      "2026-10-06": { pageviews: 0, visitors: 0 },
      "2026-10-07": { pageviews: 5 },
      "2026-10-08": { pageviews: 6, visitors: 6 },
    });
    expectSnapshotsAgree(FIVE_DAYS, result, FIVE_DAY_PATHS);
    expect(result.note).toBe("入库 3 篇文章，补了 4 天历史");
  });

  it("新旧作品都没数据：老作品发布得比半年窗口还早，照旧补满半年", async () => {
    const traffic: Traffic = {
      "2026-04-10": { "/posts/old/": 1 },
      "2026-10-08": { "/posts/old/": 2, "/posts/new/": 1 },
    };
    const server = new FakeUmami(traffic);
    const works = [
      makeWork("b-1", "old", { publishedAt: "2026-03-01" }),
      makeWork("b-2", "new", { publishedAt: "2026-10-06" }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(result.account).toHaveLength(182);
    expect(result.account[0]?.day).toBe("2026-04-10");
    // 全量累计一次，加上 04-11 到 10-08 每天一次
    const singleDays = requestedDays(server, "expanded").filter(
      (range) => !range.startsWith("2000"),
    );
    expect(singleDays).toHaveLength(181);
    expect(singleDays[0]).toBe("2026-04-11~2026-04-11");
    expect(singleDays[singleDays.length - 1]).toBe("2026-10-08~2026-10-08");
    expect(result.note).toBe("入库 2 篇文章，补了 182 天历史");
  });

  it("新作品没写发布日期：按窗口第一天算，补满半年", async () => {
    const traffic: Traffic = {
      "2026-04-10": { "/": 3 },
      "2026-10-08": { "/posts/a/": 1 },
    };
    const server = new FakeUmami(traffic);
    const works = [
      makeWork("b-1", "a", { publishedAt: null }),
      makeWork("b-2", "b", { publishedAt: "2026-10-06" }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(result.account).toHaveLength(182);
    expect(
      requestedDays(server, "expanded").filter(
        (range) => !range.startsWith("2000"),
      ),
    ).toHaveLength(181);
  });

  it("账号从没拉过：账号每天补满半年，不按作品的发布日期收窄", async () => {
    const traffic: Traffic = {
      "2026-04-10": { "/": 3 },
      "2026-10-08": { "/posts/new/": 1 },
    };
    const server = new FakeUmami(traffic);

    const result = succeeded(
      await pull(server, {
        works: [makeWork("b-1", "new", { publishedAt: "2026-10-06" })],
      }),
    );

    expect(result.account).toHaveLength(182);
    expect(result.account[0]?.day).toBe("2026-04-10");
  });

  it("新作品发布得比上次拉到的后一天还晚：起点退到上次拉到的后一天，中间不漏天", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: { day: "2026-10-04", pageviews: 2 } }),
      makeWork("b-2", "b", { totals: { day: "2026-10-04", pageviews: 0 } }),
      makeWork("b-3", "c", { publishedAt: "2026-10-07" }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-04" }),
    );

    expect(result.account.map((row) => row.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expectSnapshotsAgree(FIVE_DAYS, result, FIVE_DAY_PATHS);
  });

  it("新作品今天才发布（昨天还没有访问）：只补昨天一天，记一条 0", async () => {
    const server = new FakeUmami(FIVE_DAYS);
    const works = [
      makeWork("b-1", "a", { totals: { day: "2026-10-07", pageviews: 6 } }),
      makeWork("b-2", "fresh", { publishedAt: "2026-10-09" }),
    ];

    const result = succeeded(
      await pull(server, { works, lastSnapshotDay: "2026-10-07" }),
    );

    expect(result.account.map((row) => row.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expect(server.requests).toHaveLength(3);
    expect(groupByWork(result)).toEqual({
      "b-1": { "2026-10-08": { pageviews: 11, visitors: 10 } },
      "b-2": { "2026-10-08": { pageviews: 0, visitors: 0 } },
    });
    expect(result.note).toBe("入库 2 篇文章，补了 1 天历史");
  });
});
