/**
 * 知乎拿数据：额度（按剩余定用量、查不到兜底 90、剩太少不拉）、轮流、失败路径。
 * 快照怎么算在 data.test.ts。
 */
import { describe, expect, it } from "vitest";

import {
  createZhihuDataTool,
  MAX_REQUESTS_PER_PULL,
} from "../../../src/platforms/zhihu/data.js";
import {
  ACCESS_SECRET,
  FakeZhihu,
  makePullContext,
  makeWork,
} from "./api-fixtures.js";

/** 给假平台放 n 篇不带日期的数（Metrics 是到现在的累计，不嵌 Today / Yesterday） */
function seedWorks(server: FakeZhihu, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const url = `https://zhuanlan.zhihu.com/p/${100 + index}`;
    server.cumulativeByUrl.set(url, [
      {
        ContentType: "article",
        ContentToken: String(100 + index),
        Url: url,
        Metrics: { ViewCount: index },
      },
    ]);
  }
}

function worksOf(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeWork(`w${index}`, String(100 + index)),
  );
}

describe("知乎拿数据（额度和轮流）", () => {
  it("额度：先查 quota（不算用量），按 RemainingQuota − 10 定本次最多用几次", async () => {
    const server = new FakeZhihu();
    server.quotaRemaining = 30; // 本次最多用 20 次（查额度那次不算）：1 账号 + 19 篇
    seedWorks(server, 40);

    const result = pulled(
      await createTool().pull(
        makePullContext({ works: worksOf(40), fetch: server.fetch }),
      ),
    );

    // 总请求 21 次：查额度 1（不算用量）+ 账号 1 + 单篇 19
    expect(server.requests).toHaveLength(21);
    expect(
      server.requests.filter((request) => request.path === "/quota"),
    ).toHaveLength(1);
    expect(result.note).toContain("21 篇下次轮到");
  });

  it("查额度失败：按 90 次兜底", async () => {
    const server = new FakeZhihu();
    // 查额度报 90001，客户端重试 3 次仍失败才报错；拿数据当「查不到」按兜底走
    server.quotaFails = true;
    seedWorks(server, 100);

    const result = pulled(
      await createTool().pull(
        makePullContext({ works: worksOf(100), fetch: server.fetch }),
      ),
    );

    // 查额度 4 次（1 + 客户端重试 3，都不算用量）+ 账号 1 + 单篇 89，用了 90 次
    expect(server.requests).toHaveLength(MAX_REQUESTS_PER_PULL + 4);
    expect(result.note).toContain("11 篇下次轮到");
  });

  it("额度剩不足 10 次：不够拉，失败不写库", async () => {
    const server = new FakeZhihu();
    server.quotaRemaining = 8; // 8 − 10 不到 1 次

    const outcome = await createTool().pull(
      makePullContext({ works: worksOf(1), fetch: server.fetch }),
    );

    expect(outcome.ok).toBe(false);
    // 只查了额度，账号和单篇都没发
    expect(server.requests.map((request) => request.path)).toEqual(["/quota"]);
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
    expect(outcome).toMatchObject({ ok: false, expiredKey: "access-secret" });
    if (!outcome.ok) expect(outcome.reason).not.toContain(ACCESS_SECRET);
  });

  it("整次失败不写半截：第 2 篇失败时，第 1 篇已拿到的数也不返回", async () => {
    const server = new FakeZhihu();
    seedWorks(server, 2);
    let calls = 0;
    server.intercept = (request) => {
      if (request.path !== "/user/creator_content_stats")
        return Response.json({ Code: 0, Message: "success", Data: {} });
      calls += 1;
      if (calls === 1)
        return Response.json({
          Code: 0,
          Message: "success",
          Data: { Items: [] },
        });
      return Response.json({ Code: 30002, Message: "quota", Data: null });
    };

    const outcome = await createTool().pull(
      makePullContext({ works: worksOf(2), fetch: server.fetch }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("轮流：从没拉过的在前，这次装不下的下次轮到", async () => {
    const server = new FakeZhihu();
    server.quotaRemaining = 100; // 本次最多用 90 次：账号 1 + 单篇 89，90 篇里 1 篇下次轮到
    seedWorks(server, 90);

    await createTool().pull(
      makePullContext({
        works: Array.from({ length: 90 }, (_, index) =>
          makeWork(`w${index}`, String(100 + index), {
            totals: { views: index },
            // 最后两篇从没拉过，排最前
            totalsDay: index < 88 ? "2026-10-05" : undefined,
          }),
        ),
        fetch: server.fetch,
      }),
    );

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
    // 两篇从没拉过的都拉了（优先级最高），这次共拉 89 篇
    expect(asked.has("188")).toBe(true);
    expect(asked.has("189")).toBe(true);
    expect(asked.size).toBe(89);
  });

  it("进度回调：每篇一条，带序号和总数", async () => {
    const server = new FakeZhihu();
    seedWorks(server, 2);
    const progress: string[] = [];

    await createTool().pull(
      makePullContext({
        works: worksOf(2),
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

function pulled(
  outcome: Awaited<ReturnType<ReturnType<typeof createTool>["pull"]>>,
) {
  if (!outcome.ok) throw new Error(`拉数据失败：${outcome.reason}`);
  return outcome.result;
}
