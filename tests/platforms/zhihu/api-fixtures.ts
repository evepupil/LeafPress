/**
 * 知乎拿数据、导入测试的公共夹具：一个假的知乎开放平台。
 *
 * 所有密钥、链接、编号都是编出来的。假的 fetch 记下每个请求（路径、查询、头），
 * 按放好的数现算响应；用 intercept 控制接口的行为（出错、挂起等）。
 */
import type { Account, DayKey, Work } from "@leafpress/core";

import { normalizeZhihuUrl } from "../../../src/platforms/zhihu/api/url.js";
import type {
  DataPullContext,
  ImportContext,
} from "../../../src/platforms/types.js";

export { normalizeZhihuUrl };

export const API_BASE = "https://developer.zhihu.com/api/v1";
export const ACCESS_SECRET = "fakeAccessSecret0001";

export function ok(data: unknown): Response {
  return Response.json({ Code: 0, Message: "success", Data: data });
}

export function failed(code: number, message = "error"): Response {
  return Response.json({ Code: code, Message: message, Data: null });
}

export interface FakeRequest {
  index: number;
  url: URL;
  headers: Record<string, string>;
  /** 路径，例如 /user/creator_account_stats */
  path: string;
  query: Record<string, string>;
}

export type Responder = (request: FakeRequest) => Response | Promise<Response>;

/** 一条本人内容（user/contents 的行） */
export interface ContentItem {
  ContentType: string;
  Url: string;
  CreatedAt: number;
  LikeCount?: number;
  CommentCount?: number;
  FavoriteCount?: number;
  Title?: string;
  Summary?: string;
}

/** 单篇创作数据（creator_content_stats 的行）：Metrics 是到现在的累计，嵌 Today、Yesterday（实测第 4 条） */
export interface ContentStatsItem {
  ContentType: string;
  ContentToken: string;
  Url: string;
  Title?: string;
  /** 一行只带一个 Metrics（官方示例的形状） */
  Metrics: Record<string, unknown>;
}

export class FakeZhihu {
  readonly requests: FakeRequest[] = [];
  /** 拦下所有请求（测出错路径用）；没配就按放好的数回 */
  intercept: Responder | undefined;
  /** 本人内容列表（user/contents 用） */
  contents: ContentItem[] = [];
  /** 单篇创作数据：不带日期请求时回的累计行，按规范化后的链接查 */
  cumulativeByUrl = new Map<string, ContentStatsItem[]>();
  /** 账号创作数据（creator_account_stats 用） */
  accountStats: Record<string, unknown> = {};
  /** creator 额度项的剩余次数（quota 用）；配 true 让查额度失败（测兑底） */
  quotaRemaining = 200;
  quotaFails = false;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      (init?.headers ?? {}) as Record<string, string>,
    ))
      headers[key.toLowerCase()] = value;
    const request: FakeRequest = {
      index: this.requests.length + 1,
      url,
      headers,
      path: url.pathname.replace(/^\/api\/v1/, ""),
      query: Object.fromEntries(url.searchParams.entries()),
    };
    this.requests.push(request);

    const intercepted = this.intercept?.(request);
    if (intercepted) return intercepted;
    return this.respond(request);
  };

  private respond(request: FakeRequest): Response {
    if (request.path === "/user/contents") {
      const offset = Number(request.query["Offset"] ?? "0");
      const limit = Number(request.query["Limit"] ?? "20");
      const page = this.contents.slice(offset, offset + limit);
      const isEnd = offset + page.length >= this.contents.length;
      return ok({
        Items: page,
        Paging: {
          IsEnd: isEnd,
          ...(isEnd ? {} : { NextOffset: String(offset + page.length) }),
          Totals: this.contents.length,
        },
      });
    }
    if (request.path === "/quota") {
      if (this.quotaFails) return failed(90001, "quota read failed");
      return ok([
        {
          APIID: "creator",
          APIName: "创作能力",
          TotalQuota: this.quotaRemaining + 5,
          TotalUsed: 5,
          RemainingQuota: this.quotaRemaining,
        },
      ]);
    }
    if (request.path === "/user/creator_account_stats")
      return ok(this.accountStats);
    if (request.path === "/user/creator_content_stats") {
      const raw = request.query["ContentUrl"] ?? "";
      const url = normalizeZhihuUrl(raw);
      if (url === undefined) return failed(10001, "content not found");
      return ok({ Items: this.cumulativeByUrl.get(url) ?? [] });
    }
    return failed(10001, "unknown api");
  }
}

// ---------------------------------------------------------------------------
// 账号、作品、上下文

export function makeAccount(id = "zhihu-1"): Account {
  return {
    id,
    platform: "zhihu",
    name: "测试知乎",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: `/data/accounts/${id}.md`,
    settings: [],
    createdAt: "2026-01-01T09:00:00+08:00",
    updatedAt: "2026-01-01T09:00:00+08:00",
  };
}

export interface ZhihuWorkOptions {
  url?: string;
  publishedAt?: DayKey | null;
  totalsDay?: DayKey;
  totals?: Record<string, number>;
}

export function makeWork(
  id: string,
  slug: string,
  options: ZhihuWorkOptions = {},
): Work {
  return {
    id,
    title: `内容 ${slug}`,
    accountId: "zhihu-1",
    status: "done",
    brief: "",
    source: { kind: "import" },
    workflowId: "zhihu-article",
    step: 6,
    feedbackHistory: [],
    order: 0,
    createdAt: "2026-10-01T09:00:00+08:00",
    updatedAt: "2026-10-01T09:00:00+08:00",
    url: options.url ?? `https://zhuanlan.zhihu.com/p/${slug}`,
    ...(options.publishedAt === null
      ? {}
      : { publishedAt: options.publishedAt ?? "2026-09-01" }),
    ...(options.totals
      ? { totals: options.totals, totalsDay: options.totalsDay }
      : {}),
    tags: [],
    log: [],
  };
}

export interface PullContextOptions {
  works: Work[];
  today?: DayKey;
  lastSnapshotDay?: DayKey;
  secrets?: Record<string, string | undefined>;
  fetch: typeof fetch;
  progress?: (message: string) => void;
}

export function makePullContext(options: PullContextOptions): DataPullContext {
  const secrets: Record<string, string | undefined> = {
    "access-secret": ACCESS_SECRET,
    ...options.secrets,
  };
  return {
    account: makeAccount(),
    works: options.works,
    today: options.today ?? "2026-10-09",
    now: new Date("2026-10-09T09:00:00+08:00"),
    setting: () => undefined,
    secret: (key) => secrets[key],
    exec: () => Promise.reject(new Error("拿数据不该调外部命令")),
    fetch: options.fetch,
    sleep: () => Promise.resolve(),
    ...(options.lastSnapshotDay === undefined
      ? {}
      : { lastSnapshotDay: options.lastSnapshotDay }),
    ...(options.progress === undefined ? {} : { progress: options.progress }),
  };
}

export interface ImportContextOptions {
  secrets?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

export function makeImportContext(
  options: ImportContextOptions = {},
): ImportContext {
  const secrets: Record<string, string | undefined> = {
    "access-secret": ACCESS_SECRET,
    ...options.secrets,
  };
  return {
    account: makeAccount(),
    home: "C:/tmp/leafpress-test-home",
    setting: () => undefined,
    secret: (key) => secrets[key],
    exec: () => Promise.reject(new Error("导入不该调外部命令")),
    fetch:
      options.fetch ??
      (() => Promise.reject(new Error("这个测试没给假的 fetch"))),
    sleep: () => Promise.resolve(),
    today: "2026-10-09",
  };
}

/** 不真等的等待 */
export const noSleep = (): Promise<void> => Promise.resolve();

/** 可编程的假 fetch：按序回 responses，用完回最后一个；一条都没配回成功 */
export class FakeFetch {
  readonly requests: { url: URL }[] = [];
  readonly responses: Response[] = [];

  readonly fetch: typeof fetch = (input) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    this.requests.push({ url });
    const next =
      this.responses.length > 1 ? this.responses.shift() : this.responses[0];
    return Promise.resolve(next ?? ok({}));
  };

  /** 之后每次都回这个（追加；用完的最后一个会一直重复） */
  always(response: Response): this {
    this.responses.push(response);
    return this;
  }
}
