import { describe, expect, it } from "vitest";

import { createZhihuQuestionFinder } from "../../../src/platforms/zhihu/ideas/finder.js";
import type {
  QuestionFinderContext,
  QuestionFinderOutcome,
} from "../../../src/platforms/types.js";
import {
  ACCESS_SECRET,
  FakeZhihu,
  failed,
  makeAccount,
  noSleep,
  ok,
  type FakeRequest,
} from "./api-fixtures.js";

function question(id: number, title = `问题 ${id}`) {
  return {
    Title: title,
    Url: `https://www.zhihu.com/question/${id}`,
  };
}

function context(
  server: FakeZhihu,
  options: Partial<
    Pick<QuestionFinderContext, "topics" | "blogs" | "skipQuestionIds">
  > = {},
  accessSecret: string | undefined = ACCESS_SECRET,
): QuestionFinderContext {
  return {
    account: makeAccount(),
    topics: options.topics ?? [],
    blogs: options.blogs ?? [],
    skipQuestionIds: options.skipQuestionIds ?? new Set<string>(),
    secret: (key) => (key === "access-secret" ? accessSecret : undefined),
    fetch: server.fetch,
    sleep: noSleep,
  };
}

function success(outcome: QuestionFinderOutcome) {
  if (!outcome.ok) throw new Error(`找问题失败：${outcome.reason}`);
  return outcome;
}

function requestSummaryIds(requests: FakeRequest[]): string[] {
  return requests
    .filter((request) => request.path === "/content/question_answers")
    .map((request) => request.query["QuestionUrl"] ?? "");
}

describe("知乎找问题工具", () => {
  it("按四步执行并合并来源、主题词和博客编号，跳过指定问题", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path === "/user/question_recommendations") {
        const query = request.query["Query"];
        if (query === undefined)
          return ok({
            Items: [question(101), question(102), question(199)],
          });
        if (query === "大模型")
          return ok({ Items: [question(101), question(103)] });
        if (query === "编程")
          return ok({ Items: [question(103), question(104)] });
        if (query === "博客题目")
          return ok({ Items: [question(105), question(101)] });
      }
      if (request.path === "/content/zhihu_search")
        return ok({
          Items: [
            {
              ContentType: "answer",
              Title: "问题 105 - 知乎",
              Url: "https://www.zhihu.com/question/105/answer/1005?utm_source=x",
            },
            {
              ContentType: "question",
              Title: "博客题目搜索 106",
              Url: "https://www.zhihu.com/question/106",
            },
            {
              ContentType: "article",
              Title: "文章 107",
              Url: "https://www.zhihu.com/question/107",
            },
          ],
        });
      if (request.path === "/content/hot_list")
        return ok({
          Items: [
            question(104, "编程热问题"),
            question(108, "大模型热问题"),
            question(109, "无关热榜"),
          ],
        });
      if (request.path === "/content/question_answers")
        return ok({ Items: [{ Summary: "已有回答摘要" }] });
      return failed(10001, "unexpected request");
    };

    const outcome = success(
      await createZhihuQuestionFinder().find(
        context(server, {
          topics: ["大模型", "编程"],
          blogs: [{ workId: "blog-1", title: "博客题目" }],
          skipQuestionIds: new Set(["102"]),
        }),
      ),
    );

    expect(server.requests.slice(0, 6).map((request) => request.path)).toEqual([
      "/user/question_recommendations",
      "/user/question_recommendations",
      "/user/question_recommendations",
      "/user/question_recommendations",
      "/content/zhihu_search",
      "/content/hot_list",
    ]);
    expect(server.requests.slice(0, 4).map((request) => request.query)).toEqual(
      [
        { Count: "20" },
        { Count: "10", Query: "大模型" },
        { Count: "10", Query: "编程" },
        { Count: "5", Query: "博客题目" },
      ],
    );

    expect(outcome.questions.map((item) => item.questionId)).toEqual([
      "101",
      "199",
      "103",
      "104",
      "106",
      "108",
    ]);
    const byId = new Map(
      outcome.questions.map((item) => [item.questionId, item]),
    );
    expect(byId.get("101")).toMatchObject({
      via: ["personal", "topic"],
      topics: ["大模型"],
      blogWorkIds: [],
      url: "https://www.zhihu.com/question/101",
      answerSummaries: [],
    });
    expect(byId.get("104")).toMatchObject({
      via: ["topic", "hot"],
      topics: ["编程"],
    });
    expect(byId.get("106")).toMatchObject({
      via: ["blog"],
      blogWorkIds: ["blog-1"],
    });
    expect(byId.has("102")).toBe(false);
    expect(byId.has("105")).toBe(false);
    expect(requestSummaryIds(server.requests)).toEqual([]);
    expect(outcome.stages).toEqual([
      { stage: "personal", found: 3 },
      { stage: "topic", found: 3 },
      { stage: "blog", found: 1 },
      { stage: "hot", found: 2 },
    ]);
  });

  it("没有主题词时跳过主题推荐和热榜，仍返回四个 stage", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path === "/user/question_recommendations")
        return ok({ Items: [question(1)] });
      return failed(10001, "unexpected request");
    };

    const outcome = success(
      await createZhihuQuestionFinder().find(context(server)),
    );

    expect(server.requests.map((request) => request.path)).toEqual([
      "/user/question_recommendations",
    ]);
    expect(outcome.stages).toEqual([
      { stage: "personal", found: 1 },
      { stage: "topic", found: 0 },
      { stage: "blog", found: 0 },
      { stage: "hot", found: 0 },
    ]);
  });

  it("找问题只发现，不请求回答摘要", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path === "/user/question_recommendations") {
        if (request.query["Query"] === undefined)
          return ok({ Items: [question(1), question(2)] });
        if (request.query["Query"] === "主题")
          return ok({ Items: [question(2)] });
      }
      if (request.path === "/content/hot_list")
        return ok({ Items: [question(4, "主题热题")] });
      return failed(10001, "unexpected request");
    };

    const outcome = success(
      await createZhihuQuestionFinder().find(
        context(server, { topics: ["主题"] }),
      ),
    );

    expect(server.requests.map((request) => request.path)).toEqual([
      "/user/question_recommendations",
      "/user/question_recommendations",
      "/content/hot_list",
    ]);
    expect(outcome.questions.map((item) => item.questionId)).toEqual([
      "1",
      "2",
      "4",
    ]);
    expect(outcome.questions.map((item) => item.answerSummaries)).toEqual([
      [],
      [],
      [],
    ]);
    expect(outcome.stages.map((stage) => stage.stage)).toEqual([
      "personal",
      "topic",
      "blog",
      "hot",
    ]);
    expect(requestSummaryIds(server.requests)).toEqual([]);
  });

  it("博客推荐和搜索都按标题相关性过滤", async () => {
    const server = new FakeZhihu();
    const blogTitle = "Git Bash 中文乱码显示问题";
    server.intercept = (request) => {
      if (request.path === "/user/question_recommendations") {
        if (request.query["Query"] === undefined) return ok({ Items: [] });
        if (request.query["Query"] === blogTitle)
          return ok({
            Items: [
              question(1, "为什么中国文化进步很慢"),
              question(4, "英语学习时发现抛不开中文怎么办？"),
              question(6, "准大一想学软件工程应该怎么准备？"),
            ],
          });
      }
      if (request.path === "/content/zhihu_search")
        return ok({
          Items: [
            {
              ContentType: "question",
              ...question(2, "为什么中国文化进步很慢"),
            },
            {
              ContentType: "question",
              ...question(5, "英语学习时发现抛不开中文怎么办？"),
            },
            {
              ContentType: "question",
              ...question(3, "VS Code 终端中文乱码怎么解决"),
            },
            {
              ContentType: "question",
              ...question(7, "准大一想学软件工程应该怎么准备？"),
            },
          ],
        });
      return failed(10001, "unexpected request");
    };

    const outcome = success(
      await createZhihuQuestionFinder().find(
        context(server, {
          blogs: [{ workId: "blog-git-bash", title: blogTitle }],
        }),
      ),
    );

    expect(outcome.questions.map((item) => item.questionId)).toEqual(["3"]);
    expect(outcome.questions[0]?.blogWorkIds).toEqual(["blog-git-bash"]);
    expect(outcome.stages[2]).toEqual({ stage: "blog", found: 1 });
  });

  it("summarize 按输入顺序逐题取三条摘要", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path === "/content/question_answers")
        return ok({
          Items: [
            { Summary: `摘要 ${request.query["QuestionUrl"]}` },
            { Summary: "第二条摘要" },
            { Summary: "第三条摘要" },
            { Summary: "超出上限的摘要" },
          ],
        });
      return failed(10001, "unexpected request");
    };
    const questions = [1, 3, 5, 2, 4, 6].map((id) => ({
      questionId: String(id),
      url: `https://www.zhihu.com/question/${id}`,
    }));

    const outcome = await createZhihuQuestionFinder().summarize(
      context(server),
      questions,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(requestSummaryIds(server.requests)).toEqual(
      questions.map((item) => item.url),
    );
    expect(
      server.requests.every((request) => request.query["Limit"] === "3"),
    ).toBe(true);
    expect(outcome.summaries.get("1")).toEqual([
      "摘要 https://www.zhihu.com/question/1",
      "第二条摘要",
      "第三条摘要",
    ]);
    expect(outcome.summaries.get("6")).toHaveLength(3);
  });

  it("summary 当天额度耗尽后停止并报告已补数量", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path !== "/content/question_answers")
        return failed(10001, "unexpected request");
      if (request.query["QuestionUrl"]?.endsWith("/2"))
        return failed(30001, "daily quota exceeded");
      return ok({
        Items: [{ Summary: `摘要 ${request.query["QuestionUrl"]}` }],
      });
    };
    const questions = [1, 2, 3].map((id) => ({
      questionId: String(id),
      url: `https://www.zhihu.com/question/${id}`,
    }));

    const outcome = await createZhihuQuestionFinder().summarize(
      context(server),
      questions,
    );

    expect(outcome).toMatchObject({
      ok: true,
      warning: "今天问题发现的额度用完了，只补了 1 个",
    });
    if (!outcome.ok) throw new Error(outcome.reason);
    expect([...outcome.summaries.keys()]).toEqual(["1"]);
    expect(requestSummaryIds(server.requests)).toEqual([
      questions[0]?.url,
      questions[1]?.url,
    ]);
  });

  it("summary 每秒限流或单题失败只记警告并继续", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path !== "/content/question_answers")
        return failed(10001, "unexpected request");
      const questionUrl = request.query["QuestionUrl"] ?? "";
      if (questionUrl.endsWith("/1"))
        return failed(30001, "second limit exceeded");
      if (questionUrl.endsWith("/2"))
        return failed(10001, "answer unavailable");
      return ok({ Items: [{ Summary: "第三题摘要" }] });
    };
    const questions = [1, 2, 3].map((id) => ({
      questionId: String(id),
      url: `https://www.zhihu.com/question/${id}`,
    }));

    const outcome = await createZhihuQuestionFinder().summarize(
      context(server),
      questions,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.warning).toContain("second limit");
    expect([...outcome.summaries.keys()]).toEqual(["3"]);
    expect(requestSummaryIds(server.requests)).toEqual([
      questions[0]?.url,
      questions[0]?.url,
      questions[0]?.url,
      questions[0]?.url,
      questions[1]?.url,
      questions[2]?.url,
    ]);
  });

  it("summary 密钥失效时返回过期密钥标记", async () => {
    const server = new FakeZhihu();
    server.intercept = () => failed(20001, "bad access secret");

    await expect(
      createZhihuQuestionFinder().summarize(context(server), [
        { questionId: "1", url: "https://www.zhihu.com/question/1" },
      ]),
    ).resolves.toEqual({
      ok: false,
      reason: "知乎开放平台密钥不对或已过期",
      fixHint: "在知乎开放平台个人中心重新生成 Access Secret，填到接入里",
      expiredKey: "access-secret",
    });
  });

  it("没配密钥时不发请求，返回设置提示", async () => {
    const server = new FakeZhihu();

    await expect(
      createZhihuQuestionFinder().find(context(server, {}, "   ")),
    ).resolves.toEqual({
      ok: false,
      reason: "知乎账号还没填开放平台密钥",
      fixHint: "在接入里填上开放平台的 Access Secret",
    });
    expect(server.requests).toEqual([]);
  });

  it("密钥失效时整体失败并标记过期密钥", async () => {
    const server = new FakeZhihu();
    server.intercept = () => failed(20001, "bad access secret");

    const outcome = await createZhihuQuestionFinder().find(context(server));

    expect(outcome).toEqual({
      ok: false,
      reason: "知乎开放平台密钥不对或已过期",
      fixHint: "在知乎开放平台个人中心重新生成 Access Secret，填到接入里",
      expiredKey: "access-secret",
    });
    expect(server.requests).toHaveLength(1);
  });

  it("问题发现额度用完后跳过同组请求，热榜和知乎搜索仍继续", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path === "/user/question_recommendations") {
        if (request.query["Query"] === undefined)
          return ok({ Items: [question(1)] });
        return failed(30001, "daily quota exceeded");
      }
      if (request.path === "/content/zhihu_search")
        return ok({
          Items: [
            {
              ContentType: "question",
              ...question(2, "博客中文乱码如何解决"),
            },
          ],
        });
      if (request.path === "/content/hot_list")
        return ok({ Items: [question(3, "主题一热榜问题")] });
      return failed(10001, "unexpected request");
    };

    const outcome = success(
      await createZhihuQuestionFinder().find(
        context(server, {
          topics: ["主题一", "主题二"],
          blogs: [{ workId: "blog-1", title: "博客中文乱码问题" }],
        }),
      ),
    );

    expect(server.requests.map((request) => request.path)).toEqual([
      "/user/question_recommendations",
      "/user/question_recommendations",
      "/content/zhihu_search",
      "/content/hot_list",
    ]);
    expect(server.requests[1]?.query["Query"]).toBe("主题一");
    expect(outcome.questions.map((item) => item.questionId)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(outcome.stages).toEqual([
      { stage: "personal", found: 1 },
      {
        stage: "topic",
        found: 0,
        warning: "今天问题发现的额度用完了",
      },
      {
        stage: "blog",
        found: 1,
        warning: "今天问题发现的额度用完了",
      },
      { stage: "hot", found: 1 },
    ]);
  });

  it("每秒限流重试耗尽只记警告，继续查后续主题词", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path === "/user/question_recommendations") {
        if (request.query["Query"] === undefined)
          return ok({ Items: [question(1, "个人推荐问题")] });
        if (request.query["Query"] === "触发限流")
          return failed(30001, "second limit exceeded");
        if (request.query["Query"] === "继续查找")
          return ok({ Items: [question(2, "继续查找问题")] });
      }
      if (request.path === "/content/hot_list") return ok({ Items: [] });
      if (request.path === "/content/question_answers")
        return ok({ Items: [{ Summary: "已有摘要" }] });
      return failed(10001, "unexpected request");
    };

    const outcome = success(
      await createZhihuQuestionFinder().find(
        context(server, {
          topics: ["触发限流", "继续查找"],
        }),
      ),
    );

    const recommendationRequests = server.requests.filter(
      (request) => request.path === "/user/question_recommendations",
    );
    expect(
      recommendationRequests.map((request) => request.query["Query"]),
    ).toEqual([
      undefined,
      "触发限流",
      "触发限流",
      "触发限流",
      "触发限流",
      "继续查找",
    ]);
    expect(requestSummaryIds(server.requests)).toEqual([]);
    expect(outcome.stages).toEqual([
      { stage: "personal", found: 1 },
      {
        stage: "topic",
        found: 1,
        warning:
          "知乎开放平台限流（每秒调用次数超了），重试 3 次仍不行：second limit exceeded",
      },
      { stage: "blog", found: 0 },
      { stage: "hot", found: 0 },
    ]);
    expect(outcome.stages[1]?.warning).not.toContain("额度用完");
  });

  it("普通错误只记在对应 stage 的 warning，后续主题词和热榜继续", async () => {
    const server = new FakeZhihu();
    server.intercept = (request) => {
      if (request.path === "/user/question_recommendations") {
        if (request.query["Query"] === undefined)
          return failed(10001, "personal unavailable");
        if (request.query["Query"] === "坏主题")
          return failed(10001, "topic unavailable");
        if (request.query["Query"] === "好主题")
          return ok({ Items: [question(20)] });
      }
      if (request.path === "/content/hot_list")
        return ok({ Items: [question(21, "好主题热榜")] });
      return failed(10001, "unexpected request");
    };

    const outcome = success(
      await createZhihuQuestionFinder().find(
        context(server, { topics: ["坏主题", "好主题"] }),
      ),
    );

    expect(outcome.questions.map((item) => item.questionId)).toEqual([
      "20",
      "21",
    ]);
    expect(outcome.stages).toEqual([
      {
        stage: "personal",
        found: 0,
        warning: "知乎开放平台说参数错误或内容不可用（10001）",
      },
      {
        stage: "topic",
        found: 1,
        warning: "知乎开放平台说参数错误或内容不可用（10001）",
      },
      { stage: "blog", found: 0 },
      { stage: "hot", found: 1 },
    ]);
    expect(server.requests.map((request) => request.path)).toEqual([
      "/user/question_recommendations",
      "/user/question_recommendations",
      "/user/question_recommendations",
      "/content/hot_list",
    ]);
  });
});
