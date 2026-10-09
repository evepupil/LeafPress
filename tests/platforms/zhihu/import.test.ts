import { describe, expect, it } from "vitest";

import { createZhihuImporter } from "../../../src/platforms/zhihu/import.js";
import type { ImportOutcome } from "../../../src/platforms/types.js";
import {
  ACCESS_SECRET,
  FakeZhihu,
  makeImportContext,
  ok,
  type ContentItem,
} from "./api-fixtures.js";

function listed(outcome: ImportOutcome) {
  if (!outcome.ok) throw new Error(`导入失败：${outcome.reason}`);
  return outcome.listing;
}

/** 2026-10-07 12:34:56 +08:00 的秒级时间戳 */
const AT = 1791347696;

function item(
  contentType: string,
  url: string,
  overrides: Partial<ContentItem> = {},
): ContentItem {
  return {
    ContentType: contentType,
    Url: url,
    CreatedAt: AT,
    LikeCount: 1,
    CommentCount: 2,
    FavoriteCount: 3,
    Title: "标题",
    Summary: "摘要",
    ...overrides,
  };
}

/** 每个测试的上下文：密钥在假的配置里，fetch 走假平台 */
function context(
  server: FakeZhihu,
  options: { secrets?: Record<string, string | undefined> } = {},
) {
  return makeImportContext({ ...options, fetch: server.fetch });
}

describe("导入知乎已发内容", () => {
  it("分页取完：按 NextOffset 翻页，直到 IsEnd", async () => {
    const server = new FakeZhihu();
    const many: ContentItem[] = [];
    for (let index = 0; index < 55; index += 1)
      many.push(
        item("article", `https://zhuanlan.zhihu.com/p/${1000 + index}`),
      );
    server.contents = many;

    const listing = listed(await createZhihuImporter().list(context(server)));

    expect(listing.candidates).toHaveLength(55);
    const pages = server.requests.filter(
      (request) => request.path === "/user/contents",
    );
    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.query["Offset"])).toEqual(["0", "50"]);
    expect(pages[0]?.query["ContentType"]).toBe("all");
    expect(pages[0]?.query["Limit"]).toBe("50");
  });

  it("文章和回答都导；回答用问题标题，sourceRef 用各自编号", async () => {
    const server = new FakeZhihu();
    server.contents = [
      item("article", "https://zhuanlan.zhihu.com/p/123456", {
        Title: "我的文章",
      }),
      item("answer", "https://www.zhihu.com/question/999/answer/888", {
        Title: "如何理解某个问题？",
      }),
    ];

    const listing = listed(await createZhihuImporter().list(context(server)));

    expect(listing.candidates).toEqual([
      {
        sourceRef: "zhihu/article/123456",
        title: "我的文章",
        url: "https://zhuanlan.zhihu.com/p/123456",
        publishedAt: "2026-10-07",
        tags: [],
      },
      {
        sourceRef: "zhihu/answer/888",
        title: "如何理解某个问题？",
        url: "https://www.zhihu.com/question/999/answer/888",
        publishedAt: "2026-10-07",
        tags: [],
      },
    ]);
  });

  it("别的类型（想法、视频、问题）跳过，不算草稿也不报错", async () => {
    const server = new FakeZhihu();
    server.contents = [
      item("pin", "https://www.zhihu.com/pin/777"),
      item("zvideo", "https://www.zhihu.com/zvideo/666"),
      item("question", "https://www.zhihu.com/question/555"),
      item("article", "https://zhuanlan.zhihu.com/p/1"),
    ];

    const listing = listed(await createZhihuImporter().list(context(server)));

    expect(listing.candidates).toHaveLength(1);
    expect(listing.drafts).toBe(0);
    expect(listing.issues).toEqual([]);
  });

  it("链接解析：短链回答规范化成完整链接，带查询串的链接也认", async () => {
    const server = new FakeZhihu();
    server.contents = [
      item("answer", "https://www.zhihu.com/answer/424242?utm_source=x"),
      item("article", "http://zhuanlan.zhihu.com/p/77/?from=timeline"),
    ];

    const listing = listed(await createZhihuImporter().list(context(server)));

    expect(listing.candidates.map((candidate) => candidate.url)).toEqual([
      "https://www.zhihu.com/answer/424242",
      "https://zhuanlan.zhihu.com/p/77",
    ]);
    expect(listing.candidates.map((candidate) => candidate.sourceRef)).toEqual([
      "zhihu/answer/424242",
      "zhihu/article/77",
    ]);
  });

  it("认不出的链接记进 issues，不挡其余内容", async () => {
    const server = new FakeZhihu();
    server.contents = [
      item("article", "https://zhuanlan.zhihu.com/p/notanumber"),
      item("answer", "https://www.zhihu.com/question/1/answer/abc"),
      item("article", "https://zhuanlan.zhihu.com/p/9"),
    ];

    const listing = listed(await createZhihuImporter().list(context(server)));

    expect(listing.candidates).toHaveLength(1);
    expect(listing.issues).toHaveLength(2);
  });

  it("CreatedAt 是秒级时间戳：换成本地日期（上海时区）当发布日期", async () => {
    const server = new FakeZhihu();
    // 2026-10-08 23:30:00 UTC = 2026-10-09 07:30 +08
    server.contents = [
      item("article", "https://zhuanlan.zhihu.com/p/5", {
        CreatedAt: 1791502200,
      }),
    ];

    const listing = listed(await createZhihuImporter().list(context(server)));

    expect(listing.candidates[0]?.publishedAt).toBe("2026-10-09");
  });

  it("翻页出错：IsEnd=false 但 NextOffset 缺失 → 整次失败，不导一半", async () => {
    const server = new FakeZhihu();
    server.intercept = () =>
      ok({
        Items: [item("article", "https://zhuanlan.zhihu.com/p/1")],
        Paging: { IsEnd: false },
      });

    const outcome = await createZhihuImporter().list(context(server));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("翻页出错");
      expect(outcome.reason).toContain("没导入");
    }
  });

  it("翻页出错：NextOffset 不比上一次大（原地踏步）→ 整次失败", async () => {
    const server = new FakeZhihu();
    server.intercept = () =>
      ok({
        Items: [item("article", "https://zhuanlan.zhihu.com/p/1")],
        Paging: { IsEnd: false, NextOffset: "0" },
      });

    const outcome = await createZhihuImporter().list(context(server));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("翻页出错");
  });

  it("翻页出错：NextOffset 不是数字 → 整次失败", async () => {
    const server = new FakeZhihu();
    server.intercept = () =>
      ok({
        Items: [item("article", "https://zhuanlan.zhihu.com/p/1")],
        Paging: { IsEnd: false, NextOffset: "abc" },
      });

    const outcome = await createZhihuImporter().list(context(server));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("翻页出错");
  });

  it("翻页超过 400 页还没到头 → 整次失败，不盲拉", async () => {
    const server = new FakeZhihu();
    // 每页都回一条 + NextOffset 前进但永远 IsEnd=false
    server.intercept = (request) =>
      ok({
        Items: [
          item(
            "article",
            `https://zhuanlan.zhihu.com/p/${request.query["Offset"]}`,
          ),
        ],
        Paging: {
          IsEnd: false,
          NextOffset: String(Number(request.query["Offset"] ?? "0") + 50),
        },
      });

    const outcome = await createZhihuImporter().list(context(server));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("翻页出错");
      // 拉满 400 页就停，不会一直翻下去
      const pages = server.requests.filter(
        (request) => request.path === "/user/contents",
      );
      expect(pages).toHaveLength(400);
    }
  });

  it("没配密钥：照规格失败，不发请求", async () => {
    const server = new FakeZhihu();

    const outcome = await createZhihuImporter().list(
      context(server, { secrets: { "access-secret": undefined } }),
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "开放平台密钥还没配",
      fixHint: "在账号详情 · 接入里填",
    });
    expect(server.requests).toEqual([]);
  });

  it("密钥不对：失败并提示重新生成，错误文字里没有密钥", async () => {
    const server = new FakeZhihu();
    server.intercept = () =>
      Response.json({
        Code: 20001,
        Message: `bad secret ${ACCESS_SECRET}`,
        Data: null,
      });

    const outcome = await createZhihuImporter().list(context(server));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("密钥不对");
      expect(outcome.reason).not.toContain(ACCESS_SECRET);
    }
  });

  it("额度用完（30001）：失败并说清原因", async () => {
    const server = new FakeZhihu();
    server.intercept = () =>
      Response.json({ Code: 30001, Message: "rate limited", Data: null });

    const outcome = await createZhihuImporter().list(context(server));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("30001");
  });
});
