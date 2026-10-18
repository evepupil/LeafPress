import { BLOG_TITLE, ZHIHU_API } from "./m4-ideas-env.js";

export interface RecordedZhihuRequest {
  path: string;
  query: Record<string, string>;
}

function question(title: string, id: string): { Title: string; Url: string } {
  return { Title: title, Url: `https://www.zhihu.com/question/${id}` };
}

function apiResponse(data: unknown, code = 0, message = "success"): Response {
  return Response.json({ Code: code, Message: message, Data: data });
}

export class M4IdeasZhihuApi {
  readonly requests: RecordedZhihuRequest[] = [];
  private authExpired = false;
  private includeExtraQuestion = false;

  expireAccessSecret(): void {
    this.authExpired = true;
  }

  addExtraQuestion(): void {
    this.includeExtraQuestion = true;
  }

  readonly fetch: typeof fetch = (input) =>
    Promise.resolve(this.respond(input));

  private respond(input: string | URL | Request): Response {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    if (url.origin !== ZHIHU_API.replace(/\/api\/v1$/, ""))
      return new Response("Not found", { status: 404 });

    const path = url.pathname.replace("/api/v1", "");
    const query = Object.fromEntries(url.searchParams.entries());
    this.requests.push({ path, query });
    if (this.authExpired)
      return apiResponse(null, 20001, "access secret expired");

    if (path === "/user/question_recommendations") {
      const term = url.searchParams.get("Query");
      if (term === null) {
        const items = [
          question("TypeScript 数据流水线如何保证准确性？", "101"),
          question("缓存更新策略如何设计？", "102"),
          question("作者已经回答的 TypeScript 问题", "103"),
          question("过去收集的架构问题", "777000"),
          ...(this.includeExtraQuestion
            ? [question("如何为 TypeScript 项目设计稳定回滚？", "109")]
            : []),
        ];
        return apiResponse({ Items: items });
      }
      if (term === "TypeScript")
        return apiResponse({
          Items: [
            question("TypeScript 数据流水线如何保证准确性？", "101"),
            question("多主题协作的版本发布流程？", "104"),
            question("TypeScript 数据性能瓶颈怎么定位？", "105"),
          ],
        });
      if (term === "数据")
        return apiResponse({
          Items: [
            question("TypeScript 数据性能瓶颈怎么定位？", "105"),
            question("数据系统的 TypeScript 监控怎么做？", "108"),
          ],
        });
      if (term === BLOG_TITLE)
        return apiResponse({
          Items: [
            question("TypeScript 数据流水线如何保证准确性？", "101"),
            question("TypeScript 数据流水线怎么做才可观测？", "106"),
          ],
        });
      return apiResponse({ Items: [] });
    }

    if (path === "/content/zhihu_search") {
      if (url.searchParams.get("Query") !== BLOG_TITLE)
        return apiResponse({ HasMore: false, Items: [] });
      return apiResponse({
        HasMore: false,
        Items: [
          {
            ContentType: "article",
            ContentID: "article-9001",
            ContentText: "不应作为问题候选",
            Title: "TypeScript 相关的专栏文章",
            Url: "https://www.zhihu.com/question/110/answer/900110?utm_source=search",
            CommentCount: 1,
            VoteUpCount: 2,
            Author: {
              Name: "专栏作者",
              Url: "https://www.zhihu.com/people/column",
            },
            EditTime: 1791000000,
            AuthorityLevel: 0,
            RankingScore: 1,
          },
          {
            ContentType: "answer",
            ContentID: "answer-900107",
            ContentText: "日志采集与异常归因的回答",
            Title: "<em>TypeScript 日志中的错误如何归因？</em> - 知乎",
            Url: "https://www.zhihu.com/question/107/answer/900107?utm_source=search",
            CommentCount: 3,
            VoteUpCount: 8,
            Author: {
              Name: "回答作者",
              Url: "https://www.zhihu.com/people/answerer",
            },
            EditTime: 1791000100,
            AuthorityLevel: 0,
            RankingScore: 2,
          },
        ],
      });
    }

    if (path === "/content/hot_list")
      return apiResponse({
        Total: 3,
        Items: [
          {
            Title: "TypeScript 数据流水线如何保证准确性？",
            Url: "https://www.zhihu.com/question/101?utm_source=hot_list",
            ThumbnailUrl: "https://images.example.test/101.png",
            Summary: "热榜问题摘要",
          },
          {
            Title: "数据系统的 TypeScript 监控怎么做？",
            Url: "https://www.zhihu.com/question/108?utm_source=hot_list",
            ThumbnailUrl: "https://images.example.test/108.png",
            Summary: "监控问题摘要",
          },
          {
            Title: "与当前主题无关的问题",
            Url: "https://www.zhihu.com/question/998?utm_source=hot_list",
            ThumbnailUrl: "https://images.example.test/998.png",
            Summary: "无关问题摘要",
          },
        ],
      });

    if (path === "/content/question_answers") {
      const questionUrl = url.searchParams.get("QuestionUrl") ?? "";
      const id = /\/question\/(\d+)/.exec(questionUrl)?.[1] ?? "unknown";
      return apiResponse({
        Items: [
          {
            ContentType: "answer",
            ContentToken: `answer-${id}`,
            Url: `https://www.zhihu.com/question/${id}/answer/990${id}`,
            Summary: `  针对问题 ${id} 的回答摘要。\n补充一条可验证的实践经验。  `,
          },
        ],
        Paging: { IsEnd: true, NextOffset: "3" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}
