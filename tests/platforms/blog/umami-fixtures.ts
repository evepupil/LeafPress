/**
 * Umami 测试的公共夹具：一个假的 Umami 共享接口。
 *
 * 数据是一张「每天每个页面的访问」表，接口按请求的区间（毫秒时间戳，按上海时区换成日期）现算，
 * 所以累计、单日、日序列互相对得上，和真实的 Umami 一样。所有编号、令牌都是编出来的。
 */
import type { Account, DayKey, Work } from "@leafpress/core";

import type { DataPullContext } from "../../../src/platforms/types.js";

export const SHARE_ID = "fakeShareId0001";
export const WEBSITE_ID = "00000000-aaaa-bbbb-cccc-000000000001";
export const API_BASE = "https://umami.example.test/analytics/us/api";
export const SHARE_URL = `https://umami.example.test/analytics/us/share/${SHARE_ID}?from=settings`;
export const SITE_URL = "https://blog.example.test";

export type Visit = number | { pageviews: number; visitors: number };
/** 每天每个页面的访问；数字等于 { pageviews: n, visitors: n } */
export type Traffic = Record<DayKey, Record<string, Visit>>;

export type RequestKind =
  "share" | "stats" | "pageviews" | "expanded" | "metrics" | "other";

export interface FakeRequest {
  kind: RequestKind;
  url: URL;
  headers: Record<string, string>;
  /** 数据请求的区间（按上海时区换成日期）；share 没有 */
  firstDay?: DayKey;
  lastDay?: DayKey;
  /** 这是第几个请求（从 1 数） */
  index: number;
}

export type Interceptor = (
  request: FakeRequest,
) => Response | Promise<Response> | undefined;

const SHANGHAI_OFFSET_MS = 8 * 3_600_000;

/** 毫秒时间戳 → 上海时区的日期 */
export function shanghaiDay(ms: number): DayKey {
  return new Date(ms + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function visitOf(value: Visit): { pageviews: number; visitors: number } {
  return typeof value === "number"
    ? { pageviews: value, visitors: value }
    : value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export class FakeUmami {
  readonly requests: FakeRequest[] = [];
  /** 当前有效的令牌；换掉它，旧令牌的数据请求就返回 401 */
  currentToken = "";
  tokensIssued = 0;
  /** 取令牌的接口返回这个状态（默认 200） */
  shareStatus = 200;
  intercept: Interceptor | undefined;

  constructor(public traffic: Traffic) {
    this.rotateToken();
  }

  /** 让已发出的令牌作废，下一次取令牌拿到新的 */
  rotateToken(): void {
    this.tokensIssued += 1;
    this.currentToken = `fake-token-${this.tokensIssued}-zzzz`;
  }

  of(kind: RequestKind): FakeRequest[] {
    return this.requests.filter((request) => request.kind === kind);
  }

  /** 某个区间内每个页面的访问合计 */
  sums(
    firstDay: DayKey,
    lastDay: DayKey,
  ): Map<string, { pageviews: number; visitors: number }> {
    const result = new Map<string, { pageviews: number; visitors: number }>();
    for (const [day, pages] of Object.entries(this.traffic)) {
      if (day < firstDay || day > lastDay) continue;
      for (const [path, value] of Object.entries(pages)) {
        const visit = visitOf(value);
        const previous = result.get(path) ?? { pageviews: 0, visitors: 0 };
        result.set(path, {
          pageviews: previous.pageviews + visit.pageviews,
          visitors: previous.visitors + visit.visitors,
        });
      }
    }
    return result;
  }

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
      kind: "other",
      url,
      headers,
      index: this.requests.length + 1,
    };
    if (url.href.startsWith(`${API_BASE}/share/`)) request.kind = "share";
    else if (url.pathname.endsWith("/metrics/expanded"))
      request.kind = "expanded";
    else if (url.pathname.endsWith("/metrics")) request.kind = "metrics";
    else if (url.pathname.endsWith("/pageviews")) request.kind = "pageviews";
    else if (url.pathname.endsWith("/stats")) request.kind = "stats";
    if (request.kind !== "share" && request.kind !== "other") {
      request.firstDay = shanghaiDay(Number(url.searchParams.get("startAt")));
      request.lastDay = shanghaiDay(Number(url.searchParams.get("endAt")));
    }
    this.requests.push(request);

    const intercepted = this.intercept?.(request);
    if (intercepted) return intercepted;
    return this.respond(request);
  };

  private respond(request: FakeRequest): Response {
    const { url } = request;
    if (request.kind === "share") {
      if (this.shareStatus !== 200)
        return json({ error: "no" }, this.shareStatus);
      return json({
        shareId: SHARE_ID,
        shareType: 1,
        parameters: { overview: true },
        websiteId: WEBSITE_ID,
        token: this.currentToken,
      });
    }
    if (request.kind === "other") return json({ error: "not found" }, 404);
    if (
      request.headers["x-umami-share-token"] !== this.currentToken ||
      request.headers["x-umami-share-context"] !== "1"
    )
      return json({ error: "unauthorized" }, 401);

    const first = request.firstDay ?? "0000-01-01";
    const last = request.lastDay ?? "9999-12-31";
    if (request.kind === "pageviews") {
      const series: { x: string; y: number }[] = [];
      for (const day of Object.keys(this.traffic).sort()) {
        if (day < first || day > last) continue;
        const pages: Record<string, Visit> = this.traffic[day] ?? {};
        let total = 0;
        for (const value of Object.values(pages))
          total += visitOf(value).pageviews;
        if (total > 0) series.push({ x: `${day}T00:00:00Z`, y: total });
      }
      return json({ pageviews: series, sessions: series });
    }
    if (request.kind === "stats") {
      let pageviews = 0;
      let visitors = 0;
      for (const value of this.sums(first, last).values()) {
        pageviews += value.pageviews;
        visitors += value.visitors;
      }
      return json({
        pageviews,
        visitors,
        visits: pageviews,
        bounces: 0,
        totaltime: 0,
      });
    }

    const sorted = [...this.sums(first, last)].sort(
      ([leftName, left], [rightName, right]) =>
        right.pageviews - left.pageviews || leftName.localeCompare(rightName),
    );
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const page = sorted.slice(offset, offset + limit);
    if (request.kind === "metrics")
      return json(
        page.map(([name, value]) => ({ x: name, y: value.visitors })),
      );
    return json(
      page.map(([name, value]) => ({
        name,
        pageviews: value.pageviews,
        visitors: value.visitors,
        visits: value.pageviews,
        bounces: 0,
        totaltime: 0,
      })),
    );
  }
}

// ---------------------------------------------------------------------------
// 账号、作品、拉数据的上下文

export function makeAccount(id = "blog-1"): Account {
  return {
    id,
    platform: "blog",
    name: "测试博客",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: `/data/accounts/${id}.md`,
    settings: [],
    createdAt: "2026-01-01T09:00:00+08:00",
    updatedAt: "2026-01-01T09:00:00+08:00",
  };
}

export interface WorkOptions {
  /** 完整链接；缺省 SITE_URL/posts/<slug>/ */
  url?: string;
  /** 这篇已经有的累计（带 totalsDay）；不给就是还没有任何累计数据 */
  totals?: { day: DayKey; pageviews: number };
  /** 发布日期；缺省 2026-09-01，null 表示没写发布日期 */
  publishedAt?: DayKey | null;
  accountId?: string;
}

export function makeWork(
  id: string,
  slug: string,
  options: WorkOptions = {},
): Work {
  return {
    id,
    title: `文章 ${slug}`,
    accountId: options.accountId ?? "blog-1",
    status: "done",
    brief: "",
    source: { kind: "import" },
    workflowId: "blog-write",
    step: 4,
    feedbackHistory: [],
    order: 0,
    createdAt: "2026-10-01T09:00:00+08:00",
    updatedAt: "2026-10-01T09:00:00+08:00",
    url: options.url ?? `${SITE_URL}/posts/${slug}/`,
    ...(options.publishedAt === null
      ? {}
      : { publishedAt: options.publishedAt ?? "2026-09-01" }),
    ...(options.totals
      ? {
          totals: { pageviews: options.totals.pageviews },
          totalsDay: options.totals.day,
        }
      : {}),
    tags: [],
    log: [],
  };
}

export interface ContextOptions {
  works: Work[];
  today?: DayKey;
  lastSnapshotDay?: DayKey;
  /** 配置项；缺省有站点地址。值为 undefined 表示没配 */
  settings?: Record<string, string | undefined>;
  /** 密钥；缺省有共享链接 */
  secrets?: Record<string, string | undefined>;
  fetch: typeof fetch;
  progress?: (message: string) => void;
}

export function makeContext(options: ContextOptions): DataPullContext {
  const settings: Record<string, string | undefined> = {
    "site-url": SITE_URL,
    ...options.settings,
  };
  const secrets: Record<string, string | undefined> = {
    "umami-share": SHARE_URL,
    ...options.secrets,
  };
  return {
    account: makeAccount(),
    works: options.works,
    today: options.today ?? "2026-10-09",
    now: new Date("2026-10-09T09:00:00+08:00"),
    setting: (key) => settings[key],
    secret: (key) => secrets[key],
    exec: () => Promise.reject(new Error("拿数据不该调外部命令")),
    fetch: options.fetch,
    ...(options.lastSnapshotDay === undefined
      ? {}
      : { lastSnapshotDay: options.lastSnapshotDay }),
    ...(options.progress === undefined ? {} : { progress: options.progress }),
  };
}

/** 不真等的等待 */
export const noSleep = (): Promise<void> => Promise.resolve();
