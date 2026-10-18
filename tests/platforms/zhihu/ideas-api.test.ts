import { describe, expect, it } from "vitest";

import { createZhihuClient } from "../../../src/platforms/zhihu/api/client.js";
import {
  answerSummaries,
  hotQuestions,
  questionIdOfUrl,
  recommendQuestions,
  searchQuestions,
} from "../../../src/platforms/zhihu/ideas/api.js";
import { ACCESS_SECRET, API_BASE, noSleep, ok } from "./api-fixtures.js";

function fakeClient(payloads: unknown[]) {
  const requests: URL[] = [];
  let nextPayload = 0;
  const fetch: typeof globalThis.fetch = (input) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    requests.push(url);
    const payload = payloads[nextPayload];
    nextPayload += 1;
    return Promise.resolve(ok(payload));
  };
  return {
    client: createZhihuClient({
      secret: ACCESS_SECRET,
      fetch,
      sleep: noSleep,
      now: () => new Date("2026-10-19T00:00:00Z"),
    }),
    requests,
  };
}

describe("知乎问题接口解析", () => {
  it("问题推荐按 Count 请求，不传 query 时不带 Query，并丢掉非问题链接", async () => {
    const { client, requests } = fakeClient([
      {
        Items: [
          {
            Title: "问题一",
            Url: "https://zhihu.com/question/12345/answer/8?utm_source=test#answer",
          },
          { Title: "不是问题", Url: "https://www.zhihu.com/answer/99" },
        ],
      },
      {
        Items: [
          {
            Title: "主题问题",
            Url: "https://www.zhihu.com/question/67890/?from=feed",
          },
        ],
      },
    ]);

    await expect(recommendQuestions(client, { count: 20 })).resolves.toEqual([
      {
        questionId: "12345",
        title: "问题一",
        url: "https://www.zhihu.com/question/12345",
      },
    ]);
    await expect(
      recommendQuestions(client, { query: "大模型", count: 10 }),
    ).resolves.toEqual([
      {
        questionId: "67890",
        title: "主题问题",
        url: "https://www.zhihu.com/question/67890",
      },
    ]);

    expect(requests.map((url) => `${url.origin}${url.pathname}`)).toEqual([
      `${API_BASE}/user/question_recommendations`,
      `${API_BASE}/user/question_recommendations`,
    ]);
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      Count: "20",
    });
    expect(Object.fromEntries(requests[1]!.searchParams)).toEqual({
      Count: "10",
      Query: "大模型",
    });
  });

  it("问题回答请求 QuestionUrl 和 Limit，摘要压空白、截到 200 字并丢掉空项", async () => {
    const { client, requests } = fakeClient([
      {
        Items: [
          { Summary: "  第一行\n\t第二   段  " },
          { Summary: "x".repeat(205) },
          { Summary: " \n\t " },
          { Summary: 42 },
        ],
      },
    ]);

    await expect(
      answerSummaries(client, "https://www.zhihu.com/question/321", 3),
    ).resolves.toEqual(["第一行 第二 段", "x".repeat(200)]);

    expect(`${requests[0]?.origin}${requests[0]?.pathname}`).toBe(
      `${API_BASE}/content/question_answers`,
    );
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      QuestionUrl: "https://www.zhihu.com/question/321",
      Limit: "3",
    });
  });

  it("按 200 个字符截断，不拆开 emoji 代理对", async () => {
    const { client } = fakeClient([
      { Items: [{ Summary: `${"x".repeat(199)}😀后续内容` }] },
    ]);

    await expect(
      answerSummaries(client, "https://www.zhihu.com/question/321", 3),
    ).resolves.toEqual([`${"x".repeat(199)}😀`]);
  });

  it("热榜只保留问题并请求 Limit 30", async () => {
    const { client, requests } = fakeClient([
      {
        Items: [
          {
            Title: "热榜问题",
            Url: "https://www.zhihu.com/question/456?utm_source=hot",
          },
          {
            Title: "热榜文章",
            Url: "https://zhuanlan.zhihu.com/p/789",
          },
          {
            Title: "错误域名",
            Url: "https://zhihu.example/question/111",
          },
        ],
      },
    ]);

    await expect(hotQuestions(client)).resolves.toEqual([
      {
        questionId: "456",
        title: "热榜问题",
        url: "https://www.zhihu.com/question/456",
      },
    ]);
    expect(`${requests[0]?.origin}${requests[0]?.pathname}`).toBe(
      `${API_BASE}/content/hot_list`,
    );
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      Limit: "30",
    });
  });

  it("搜索只留回答和问题，清理 em 标签与知乎后缀", async () => {
    const { client, requests } = fakeClient([
      {
        Items: [
          {
            ContentType: "ANSWER",
            Title: "如何 <em>理解</em> TypeScript - 知乎",
            Url: "https://www.zhihu.com/question/100/answer/200?utm_source=search",
          },
          {
            ContentType: "Question",
            Title: "<em>泛型</em>是什么 - 知乎",
            Url: "https://zhihu.com/question/101/",
          },
          {
            ContentType: "article",
            Title: "文章",
            Url: "https://www.zhihu.com/question/102",
          },
          {
            ContentType: "answer",
            Title: "外站问题",
            Url: "https://not-zhihu.com/question/103",
          },
        ],
      },
    ]);

    await expect(searchQuestions(client, "TypeScript 搜索")).resolves.toEqual([
      {
        questionId: "100",
        title: "如何 理解 TypeScript",
        url: "https://www.zhihu.com/question/100",
      },
      {
        questionId: "101",
        title: "泛型是什么",
        url: "https://www.zhihu.com/question/101",
      },
    ]);

    expect(`${requests[0]?.origin}${requests[0]?.pathname}`).toBe(
      `${API_BASE}/content/zhihu_search`,
    );
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      Query: "TypeScript 搜索",
      Count: "10",
    });
  });

  it("问题编号认知乎主域名及 answer 子路径，并规范化查询串和片段", () => {
    expect(
      questionIdOfUrl("https://zhihu.com/question/987/answer/6?x=1#part"),
    ).toBe("987");
    expect(questionIdOfUrl("https://www.zhihu.com/question/654?x=1")).toBe(
      "654",
    );
    expect(questionIdOfUrl("https://www.zhihu.com/answer/654")).toBeUndefined();
    expect(questionIdOfUrl("https://example.com/question/654")).toBeUndefined();
  });
});
