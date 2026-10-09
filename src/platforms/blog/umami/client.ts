/**
 * Umami 共享链接客户端：只读，不碰任何账号口令。
 *
 * 流程：共享链接 → 取令牌（auth）→ 带令牌查数据（stats / pageviews / expandedPaths）。
 * - 节流：两次请求之间至少隔 200 毫秒；单次请求 10 秒超时。
 * - 重试：超时、网络错误、5xx、429、返回的不是 JSON，按 0.5、1、2 秒退避重试。
 * - 令牌：数据接口返回 401、403 时先重新取一次令牌再重试同一请求；只有「取令牌」这一步被拒（401、403、404）才算共享链接失效。
 * - 错误文字一律不带请求地址，并在出口再抹一遍共享编号、令牌、网站编号。
 */
import { setTimeout as delay } from "node:timers/promises";

import { redactSecrets } from "../../../config/redact.js";
import {
  UmamiAuthenticationError,
  UmamiRequestError,
  UmamiShareUrlError,
} from "./errors.js";
import { parseShareUrl } from "./share-url.js";
import { DEFAULT_TIMEZONE } from "./time.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MIN_REQUEST_GAP_MS = 200;
/** pageviews 日序列一次最多取这么多天，超过就分段 */
const MAX_PAGEVIEW_DAYS = 221;
/**
 * expandedPaths 一次取这么多行（实测共享接口对 limit 不设上限，一次就能取完全部路径）。
 * 返回的行数等于它才说明可能没取完，这时才分页。
 */
const EXPANDED_PATH_LIMIT = 5_000;
/** 核对用的普通路径列表一次取的行数（要在 1000 以上） */
const METRICS_PATH_LIMIT = 5_000;
/** 路径行数多到这个数还没取完，当作出了问题 */
const MAX_PATH_ROWS = 100_000;
const RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
const DAY_MS = 24 * 60 * 60 * 1_000;

/** 一次请求没成功但值得再试：超时、网络错误、5xx、429、返回的不是 JSON */
class RetryableRequestError extends Error {
  constructor(
    readonly kind:
      "timeout" | "network" | "server" | "rate-limit" | "invalid-json",
    readonly status?: number,
  ) {
    super(kind);
  }
}

/** 数据接口返回 401、403：先重新取令牌，再试同一个请求 */
class DataAuthorizationError extends Error {
  constructor(readonly status: number) {
    super("authorization");
  }
}

export interface UmamiPageview {
  /** YYYY-MM-DD（按请求的时区） */
  day: string;
  pageviews: number;
}

export interface UmamiExpandedPath {
  name: string;
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
}

export interface UmamiClientOptions {
  /** 缺省用全局 fetch；测试里换成假的 */
  fetch?: typeof fetch;
  shareUrl: string;
  /** 缺省 Asia/Shanghai */
  timezone?: string;
  /** 等待（节流和退避用）；测试里换成不真等的 */
  sleep?: (milliseconds: number) => Promise<void>;
  /** 单次请求的超时毫秒数；缺省 10 秒，测试里调小 */
  requestTimeoutMs?: number;
}

export interface UmamiClient {
  /** 取令牌；其余方法需要时会自己调，用来提前确认共享链接还能用 */
  auth(): Promise<void>;
  stats(startAt: number, endAt: number): Promise<Record<string, number>>;
  /** 按天的访问数；区间超过 221 天会自动分段 */
  pageviews(startAt: number, endAt: number): Promise<UmamiPageview[]>;
  /** 区间内全部页面路径的访问、访客；一次取够，分页时自己去重核对 */
  expandedPaths(startAt: number, endAt: number): Promise<UmamiExpandedPath[]>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** 接口返回的行：直接是数组，或者包在 data 里 */
function rows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const payload = record(value);
  if (payload && Array.isArray(payload["data"])) return payload["data"];
  throw new UmamiRequestError("Umami 返回的数据格式不对");
}

/** pageviews 接口返回 { pageviews: [{x, y}], sessions: [{x, y}] }，只要前者 */
function pageviewRows(value: unknown): unknown[] {
  const payload = record(value);
  if (payload && Array.isArray(payload["pageviews"]))
    return payload["pageviews"];
  return rows(value);
}

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 日序列里每行的 x：2026-10-08T00:00:00Z 或 2026-10-08 00:00:00，取前面的日期 */
function rowDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
}

function queryUrl(
  base: string,
  path: string,
  values: Record<string, string | number>,
): string {
  const url = new URL(`${base}/${path}`);
  for (const [key, value] of Object.entries(values))
    url.searchParams.set(key, String(value));
  return url.toString();
}

function validateRange(startAt: number, endAt: number): void {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt > endAt)
    throw new UmamiRequestError("Umami 时间范围不对");
}

/** 一页 expanded 的结果：raw 是接口返回的行数（分页判断看它），rows 是读得懂的行 */
interface ExpandedPage {
  raw: number;
  rows: UmamiExpandedPath[];
}

function expandedPath(item: unknown): UmamiExpandedPath | undefined {
  const entry = record(item);
  const name = entry?.["name"] ?? entry?.["x"];
  const pageviews = numeric(entry?.["pageviews"] ?? entry?.["y"]);
  if (typeof name !== "string" || pageviews === undefined) return undefined;
  return {
    name,
    pageviews,
    visitors: numeric(entry?.["visitors"]) ?? 0,
    visits: numeric(entry?.["visits"]) ?? 0,
    bounces: numeric(entry?.["bounces"]) ?? 0,
    totaltime: numeric(entry?.["totaltime"]) ?? 0,
  };
}

function uniqueByName(
  paths: readonly UmamiExpandedPath[],
): UmamiExpandedPath[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    if (seen.has(path.name)) return false;
    seen.add(path.name);
    return true;
  });
}

/** 分页取回的路径和普通路径列表核对：没有重名，名字集合完全一致 */
function namesMatch(
  expanded: readonly UmamiExpandedPath[],
  metricNames: readonly string[],
): boolean {
  const expandedNames = new Set(expanded.map((path) => path.name));
  const knownNames = new Set(metricNames);
  return (
    expandedNames.size === expanded.length &&
    knownNames.size === metricNames.length &&
    expandedNames.size === knownNames.size &&
    [...expandedNames].every((name) => knownNames.has(name))
  );
}

function exhausted(error: RetryableRequestError): UmamiRequestError {
  switch (error.kind) {
    case "timeout":
      return new UmamiRequestError("Umami 请求超时");
    case "rate-limit":
      return new UmamiRequestError("Umami 请求被限流（HTTP 429）");
    case "server":
      return new UmamiRequestError(
        `Umami 服务暂时不可用（HTTP ${error.status ?? 500}）`,
      );
    case "invalid-json":
      return new UmamiRequestError("Umami 返回的内容不是 JSON");
    case "network":
      return new UmamiRequestError("Umami 网络请求失败");
  }
}

export function createUmamiClient(options: UmamiClientOptions): UmamiClient {
  const address = parseShareUrl(options.shareUrl);
  if (!address) throw new UmamiShareUrlError();
  const { apiBase, shareId } = address;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep =
    options.sleep ?? ((milliseconds: number) => delay(milliseconds));
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

  let previousRequestAt: number | undefined;
  let authorization: { websiteId: string; token: string } | undefined;

  /** 错误文字出口：再抹一遍共享链接、共享编号、令牌、网站编号 */
  function scrub(text: string): string {
    return redactSecrets(text, [
      options.shareUrl.trim(),
      apiBase,
      shareId,
      authorization?.websiteId ?? "",
      authorization?.token ?? "",
    ]);
  }

  /** 公开方法统一包一层：失败一律变成不带地址和密钥的中文错误 */
  async function guarded<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof UmamiAuthenticationError) throw error;
      if (error instanceof UmamiRequestError) {
        const message = scrub(error.message);
        throw message === error.message
          ? error
          : new UmamiRequestError(message);
      }
      throw new UmamiRequestError("Umami 请求失败");
    }
  }

  async function waitForRequestSlot(): Promise<void> {
    if (previousRequestAt !== undefined) {
      const remaining = MIN_REQUEST_GAP_MS - (Date.now() - previousRequestAt);
      if (remaining > 0) await sleep(remaining);
    }
    previousRequestAt = Date.now();
  }

  /** 请求一次：超时、网络错误、5xx、429、非 JSON 抛 RetryableRequestError */
  async function requestOnce(
    url: string,
    headers: Record<string, string>,
    authenticationRequest: boolean,
  ): Promise<unknown> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // 超时自己计：假的 fetch 或某些环境不理会 abort 信号时，也不会一直等下去
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new RetryableRequestError("timeout"));
      }, timeoutMs);
    });
    const response = (async (): Promise<unknown> => {
      let result: Response;
      try {
        result = await fetchImpl(url, {
          method: "GET",
          headers,
          credentials: "omit",
          signal: controller.signal,
        });
      } catch {
        throw new RetryableRequestError(
          controller.signal.aborted ? "timeout" : "network",
        );
      }
      const status = result.status;
      if (status < 200 || status >= 300) {
        // 不读正文，及时放掉连接
        await result.body?.cancel().catch(() => undefined);
        if (authenticationRequest && [401, 403, 404].includes(status))
          throw new UmamiAuthenticationError();
        if (!authenticationRequest && (status === 401 || status === 403))
          throw new DataAuthorizationError(status);
        if (status === 429)
          throw new RetryableRequestError("rate-limit", status);
        if (status >= 500) throw new RetryableRequestError("server", status);
        throw new UmamiRequestError(`Umami 请求失败（HTTP ${status}）`);
      }
      try {
        return await result.json();
      } catch {
        throw new RetryableRequestError(
          controller.signal.aborted ? "timeout" : "invalid-json",
        );
      }
    })();

    try {
      return await Promise.race([response, timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      controller.abort();
    }
  }

  /** 带节流和退避重试的 GET，返回解析好的 JSON */
  async function requestJson(
    url: string,
    headers: Record<string, string>,
    authenticationRequest = false,
  ): Promise<unknown> {
    for (let retry = 0; ; retry += 1) {
      await waitForRequestSlot();
      try {
        return await requestOnce(url, headers, authenticationRequest);
      } catch (error) {
        if (!(error instanceof RetryableRequestError)) throw error;
        const backoff = RETRY_DELAYS_MS[retry];
        if (backoff === undefined) throw exhausted(error);
        await sleep(backoff);
      }
    }
  }

  async function authenticate(): Promise<{ websiteId: string; token: string }> {
    if (authorization) return authorization;
    const payload = await requestJson(
      `${apiBase}/share/${encodeURIComponent(shareId)}`,
      { Accept: "application/json", "x-umami-share-context": "1" },
      true,
    );
    const data = record(payload);
    const websiteId = data?.["websiteId"];
    const token = data?.["token"];
    if (
      typeof websiteId !== "string" ||
      websiteId === "" ||
      typeof token !== "string" ||
      token === ""
    )
      throw new UmamiRequestError("Umami 授权响应格式不对");
    authorization = { websiteId, token };
    return authorization;
  }

  /** 带令牌查一个数据接口；401、403 时先重取一次令牌再试同一个请求 */
  async function requestData(
    endpoint: "stats" | "pageviews" | "metrics/expanded" | "metrics",
    startAt: number,
    endAt: number,
    extra: Record<string, string | number> = {},
  ): Promise<unknown> {
    validateRange(startAt, endAt);
    const query: Record<string, string | number> = {
      startAt,
      endAt,
      timezone,
      ...extra,
    };
    if (endpoint === "stats" || endpoint === "pageviews") query["unit"] = "day";

    for (let refresh = 0; ; refresh += 1) {
      const { websiteId, token } = await authenticate();
      const url = queryUrl(
        apiBase,
        `websites/${encodeURIComponent(websiteId)}/${endpoint}`,
        query,
      );
      try {
        return await requestJson(url, {
          Accept: "application/json",
          "x-umami-share-context": "1",
          "x-umami-share-token": token,
        });
      } catch (error) {
        if (!(error instanceof DataAuthorizationError)) throw error;
        if (refresh > 0)
          throw new UmamiRequestError(
            `Umami 数据请求被拒绝（HTTP ${error.status}）`,
          );
        authorization = undefined;
      }
    }
  }

  async function fetchExpandedPage(
    startAt: number,
    endAt: number,
    offset: number,
  ): Promise<ExpandedPage> {
    const payload = await requestData("metrics/expanded", startAt, endAt, {
      type: "path",
      limit: EXPANDED_PATH_LIMIT,
      offset,
    });
    const raw = rows(payload);
    const parsed = raw.map(expandedPath);
    // 有读不懂的行说明接口的格式变了：宁可整次失败，也不拿缺行的数入库
    if (parsed.some((path) => path === undefined))
      throw new UmamiRequestError("Umami 返回的数据格式不对");
    return {
      raw: raw.length,
      rows: parsed.filter(
        (path): path is UmamiExpandedPath => path !== undefined,
      ),
    };
  }

  /** 普通路径列表（metrics?type=path）的全部路径名，用来核对分页有没有漏行重行 */
  async function fetchMetricNames(
    startAt: number,
    endAt: number,
  ): Promise<string[]> {
    const names: string[] = [];
    for (let offset = 0; names.length <= MAX_PATH_ROWS;) {
      const payload = await requestData("metrics", startAt, endAt, {
        type: "path",
        limit: METRICS_PATH_LIMIT,
        offset,
      });
      const page = rows(payload);
      for (const item of page) {
        const entry = record(item);
        const name = entry?.["x"] ?? entry?.["name"];
        if (typeof name === "string") names.push(name);
      }
      if (page.length < METRICS_PATH_LIMIT) return names;
      offset += page.length;
    }
    throw new UmamiRequestError("Umami 路径列表过大，无法核对完整结果");
  }

  /** 取一遍：不够一页就是全部；等于一页才继续翻页并核对。核对不过返回 undefined */
  async function expandedPathsOnce(
    startAt: number,
    endAt: number,
  ): Promise<UmamiExpandedPath[] | undefined> {
    const first = await fetchExpandedPage(startAt, endAt, 0);
    if (first.raw < EXPANDED_PATH_LIMIT) return uniqueByName(first.rows);

    const paths = [...first.rows];
    let offset = first.raw;
    for (;;) {
      const page = await fetchExpandedPage(startAt, endAt, offset);
      paths.push(...page.rows);
      if (page.raw < EXPANDED_PATH_LIMIT) break;
      offset += page.raw;
      if (paths.length > MAX_PATH_ROWS)
        throw new UmamiRequestError("Umami 路径列表过大，无法读取");
    }
    const metricNames = await fetchMetricNames(startAt, endAt);
    return namesMatch(paths, metricNames) ? uniqueByName(paths) : undefined;
  }

  return {
    auth: () =>
      guarded(async () => {
        await authenticate();
      }),

    stats: (startAt, endAt) =>
      guarded(async () => {
        const payload = await requestData("stats", startAt, endAt);
        const result: Record<string, number> = {};
        const object = record(payload);
        if (object) {
          for (const [key, value] of Object.entries(object)) {
            const amount = numeric(value);
            if (amount !== undefined) result[key] = amount;
          }
          return result;
        }
        for (const item of rows(payload)) {
          const entry = record(item);
          const key = entry?.["name"] ?? entry?.["x"];
          const amount = numeric(entry?.["value"] ?? entry?.["y"]);
          if (typeof key === "string" && amount !== undefined)
            result[key] = amount;
        }
        return result;
      }),

    pageviews: (startAt, endAt) =>
      guarded(async () => {
        validateRange(startAt, endAt);
        // 同一天出现多次（分段正好切在一天中间）时把访问加起来
        const byDay = new Map<string, number>();
        for (let cursor = startAt; cursor <= endAt;) {
          const chunkEnd = Math.min(
            endAt,
            cursor + MAX_PAGEVIEW_DAYS * DAY_MS - 1,
          );
          const payload = await requestData("pageviews", cursor, chunkEnd);
          for (const item of pageviewRows(payload)) {
            const entry = record(item);
            const day = rowDate(entry?.["x"] ?? entry?.["date"]);
            const pageviews = numeric(entry?.["y"] ?? entry?.["pageviews"]);
            if (day === undefined || pageviews === undefined)
              throw new UmamiRequestError("Umami 返回的数据格式不对");
            byDay.set(day, (byDay.get(day) ?? 0) + pageviews);
          }
          cursor = chunkEnd + 1;
        }
        return [...byDay]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([day, pageviews]) => ({ day, pageviews }));
      }),

    expandedPaths: (startAt, endAt) =>
      guarded(async () => {
        validateRange(startAt, endAt);
        // 分页核对不过就整个重来一次，还不对整次失败
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const paths = await expandedPathsOnce(startAt, endAt);
          if (paths) return paths;
        }
        throw new UmamiRequestError(
          "Umami 分页路径不完整或有重复，重试后仍无法核对",
        );
      }),
  };
}
