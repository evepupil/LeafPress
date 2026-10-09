/**
 * M3 端到端用的假知乎开放平台：只有 developer.zhihu.com/api/v1 下的三个接口有数，
 * 其余一律 404（复制页要下载站点图片时，走这里回字节）。
 */
import { normalizeZhihuUrl } from "../platforms/zhihu/api-fixtures.js";
import { YESTERDAY } from "./m3-zhihu-env.js";

/** 记下的一个请求 */
export interface RecordedRequest {
  path: string;
  query: Record<string, string>;
}

function response(data: unknown): Response {
  return Response.json({ Code: 0, Message: "success", Data: data });
}

const notFound = (): Response => new Response("not found", { status: 404 });

/** 一条本人内容（user/contents 的行） */
export interface FakeContentItem {
  ContentType: string;
  Url: string;
  CreatedAt: number;
  Title?: string;
}

/** 单篇创作数据的一行 */
export interface FakeStatsItem {
  ContentType: string;
  ContentToken: string;
  Url: string;
  Metrics: Record<string, unknown>;
}

export interface FakeZhihuApiOptions {
  /** user/contents 的页：键是 Offset 的值（字符串） */
  contentsPages: Map<
    string,
    { items: FakeContentItem[]; isEnd: boolean; nextOffset?: string }
  >;
  /** creator_account_stats 直接回的数据 */
  accountStats: Record<string, unknown>;
  /** creator_content_stats 的数据，键是规范化后的内容链接 */
  contentStats: Map<
    string,
    { cumulative: FakeStatsItem[]; daily: FakeStatsItem[] }
  >;
  /** 站点图片下载（复制页第 3 级查找），键是完整 URL */
  downloads: Map<string, Uint8Array>;
}

export class FakeZhihuApi {
  readonly requests: RecordedRequest[] = [];

  constructor(private readonly options: FakeZhihuApiOptions) {}

  readonly fetch: typeof fetch = (input) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const record: RecordedRequest = {
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    };
    this.requests.push(record);
    return Promise.resolve(this.respond(record, url));
  };

  /** 之后可以补一篇的数（归档后再拉那步用） */
  setContentStats(
    url: string,
    stats: { cumulative: FakeStatsItem[]; daily: FakeStatsItem[] },
  ): void {
    this.options.contentStats.set(url, stats);
  }

  /** 已经发出的请求数（「已是最新不再发请求」的断言用） */
  get count(): number {
    return this.requests.length;
  }

  private respond(record: RecordedRequest, url: URL): Response {
    if (url.origin !== "https://developer.zhihu.com") return this.download(url);
    if (!url.pathname.startsWith("/api/v1/")) return notFound();
    const path = url.pathname.slice("/api/v1".length);
    if (path === "/user/contents") {
      const offset = record.query["Offset"] ?? "0";
      const page = this.options.contentsPages.get(offset);
      if (!page) return notFound();
      return response({
        Items: page.items,
        Paging: {
          IsEnd: page.isEnd,
          ...(page.nextOffset === undefined
            ? {}
            : { NextOffset: page.nextOffset }),
        },
      });
    }
    if (path === "/user/creator_account_stats")
      return response(this.options.accountStats);
    if (path === "/user/creator_content_stats") {
      const normalized = normalizeZhihuUrl(record.query["ContentUrl"] ?? "");
      if (!normalized) return notFound();
      const stats = this.options.contentStats.get(normalized);
      if (!stats) return notFound();
      const start = record.query["StartDate"];
      const end = record.query["EndDate"];
      if (start && end)
        return response({
          Items: stats.daily.filter((row) => {
            const day = row.Metrics["Date"];
            return typeof day === "string" && day >= start && day <= end;
          }),
        });
      return response({ Items: stats.cumulative });
    }
    return notFound();
  }

  /** 非 API 主机的请求当站点下载（复制页下载图片） */
  private download(url: URL): Response {
    const bytes = this.options.downloads.get(url.toString());
    if (bytes === undefined) return notFound();
    return new Response(Buffer.from(bytes));
  }
}

// ---------------------------------------------------------------------------
// M3 端到端用的具体假数据

export const ARTICLE_URL = "https://zhuanlan.zhihu.com/p/100001";
export const ANSWER_URL = "https://www.zhihu.com/question/4242/answer/900001";
const PIN_URL = "https://www.zhihu.com/pin/1234567890";

/** 秒级时间戳：导入接口的 CreatedAt 用 */
function epochSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function contentItem(
  contentType: string,
  url: string,
  createdAt: string,
  title: string,
): FakeContentItem {
  return {
    ContentType: contentType,
    Url: url,
    CreatedAt: epochSeconds(createdAt),
    Title: title,
  };
}

export function statsRow(
  url: string,
  token: string,
  metrics: Record<string, unknown>,
): FakeStatsItem {
  return {
    ContentType: "article",
    ContentToken: token,
    Url: url,
    Metrics: metrics,
  };
}

export function makeM3Api(): FakeZhihuApi {
  const contentsPages = new Map<
    string,
    { items: FakeContentItem[]; isEnd: boolean; nextOffset?: string }
  >([
    [
      "0",
      {
        items: [
          contentItem(
            "article",
            "https://zhuanlan.zhihu.com/p/100001?utm_source=mine",
            "2026-09-05T20:00:00+08:00",
            "已发布的知乎文章",
          ),
          contentItem(
            "answer",
            "https://www.zhihu.com/question/4242/answer/900001?utm=x",
            "2026-09-10T21:30:00+08:00",
            "已发布的回答",
          ),
        ],
        isEnd: false,
        nextOffset: "2",
      },
    ],
    [
      "2",
      {
        items: [contentItem("pin", PIN_URL, "2026-09-12T10:00:00+08:00", "")],
        isEnd: true,
      },
    ],
  ]);
  return new FakeZhihuApi({
    contentsPages,
    accountStats: {
      Followers: { Total: 3210 },
      Metrics: { Yesterday: { ViewCount: 888 } },
    },
    contentStats: new Map([
      [
        ARTICLE_URL,
        {
          cumulative: [
            statsRow(ARTICLE_URL, "100001", {
              ViewCount: 120,
              UpvoteCount: 30,
              CollectCount: 4,
              CommentCount: 2,
              ShareCount: 1,
            }),
          ],
          daily: [
            statsRow(ARTICLE_URL, "100001", {
              Date: "2026-09-05",
              ViewCount: 5,
              UpvoteCount: 1,
            }),
            statsRow(ARTICLE_URL, "100001", {
              Date: YESTERDAY,
              ViewCount: 20,
              UpvoteCount: 5,
            }),
          ],
        },
      ],
      [
        ANSWER_URL,
        {
          cumulative: [
            statsRow(ANSWER_URL, "900001", {
              ViewCount: 45,
              UpvoteCount: 11,
              CommentCount: 3,
            }),
          ],
          daily: [
            statsRow(ANSWER_URL, "900001", {
              Date: "2026-09-10",
              ViewCount: 10,
              UpvoteCount: 2,
            }),
          ],
        },
      ],
    ]),
    downloads: new Map(),
  });
}
