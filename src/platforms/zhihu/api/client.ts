/**
 * 知乎开放平台客户端：创作者接口共用的鉴权、超时、重试和错误码处理。
 * 地址、请求头、参数、错误码一律照 docs/调研/知乎开放平台接口.md。
 *
 * - 认证（调研文档 0 节）：`Authorization: Bearer <Access Secret>`、`X-Request-Timestamp`（秒级
 *   Unix 时间戳，不是毫秒）、`Content-Type: application/json`，GET 也带。除这两个头外没有别的签名。
 * - 超时：单次请求 15 秒。
 * - 重试：网络错误（含超时）和 HTTP 5xx 按 1 秒、3 秒退避重试两次。
 * - 业务错误码（响应体里的 Code）一律不重试，直接失败并说清原因：
 *   30001 当日额度或调用频率到上限、30002 额外成功次数额度耗尽、30003 风控拒绝——
 *   这三种再试也是同样的结果，重试只会白白再耗额度；20001 密钥不对，抛 ZhihuAuthenticationError。
 * - 错误文字出口抹掉密钥（密钥只在请求头里，接口回的 Message 也一并抹）。
 */
import { setTimeout as delay } from "node:timers/promises";

import { redactSecrets } from "../../../config/redact.js";
import { ZhihuApiError, ZhihuAuthenticationError } from "./errors.js";

/** 接口根地址（调研文档 0 节） */
const API_BASE = "https://developer.zhihu.com/api/v1";
/** 单次请求超时 */
const REQUEST_TIMEOUT_MS = 15_000;
/** 网络错误和 5xx 的退避重试间隔（重试两次） */
const RETRY_DELAYS_MS = [1_000, 3_000] as const;

/** 值得再试一次的请求失败：网络错误、超时、HTTP 5xx */
class RetryableError extends Error {
  constructor(
    readonly kind: "network" | "timeout" | "server",
    readonly status?: number,
  ) {
    super(kind);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export interface ZhihuClientOptions {
  /** Access Secret；测试里用一看就是假的值 */
  secret: string;
  /** 缺省用全局 fetch；测试里换成假的 */
  fetch?: typeof fetch;
  /** 等待（退避重试用）；测试里换成不真等的 */
  sleep?: (milliseconds: number) => Promise<void>;
  /** 时钟（X-Request-Timestamp 用）；测试里换成固定的 */
  now?: () => Date;
  /** 单次请求的超时毫秒数；缺省 15 秒，测试里调小 */
  requestTimeoutMs?: number;
}

export interface ZhihuClient {
  /** GET 一个接口，返回外层 { Code, Message, Data } 里的 Data（业务错误会抛错） */
  get(path: string, query?: Record<string, string | number>): Promise<unknown>;
}

/** Code → 给人看的原因；20001 换成密钥失效的专用错误 */
function businessError(code: number, message: unknown): Error {
  if (code === 20001) return new ZhihuAuthenticationError();
  const detail =
    typeof message === "string" && message !== "" ? `：${message}` : "";
  switch (code) {
    case 10001:
      return new ZhihuApiError(
        "知乎开放平台说参数错误或内容不可用（10001）",
        code,
      );
    case 30001:
      return new ZhihuApiError(
        "知乎开放平台的当日额度或调用频率到上限了（30001），今天不用再拉",
        code,
      );
    case 30002:
      return new ZhihuApiError(
        "知乎开放平台的额外成功次数额度用完了（30002），今天不用再拉",
        code,
      );
    case 30003:
      return new ZhihuApiError(
        "知乎开放平台把这次请求当成风控拦下了（30003），过一阵再拉",
        code,
      );
    case 90001:
      return new ZhihuApiError("知乎开放平台服务内部错误（90001）", code);
    default:
      return new ZhihuApiError(
        `知乎开放平台返回错误（${code}${detail}）`,
        code,
      );
  }
}

function exhausted(error: RetryableError): ZhihuApiError {
  switch (error.kind) {
    case "network":
      return new ZhihuApiError("知乎开放平台网络请求失败");
    case "timeout":
      return new ZhihuApiError("知乎开放平台请求超时");
    case "server":
      return new ZhihuApiError(
        `知乎开放平台服务暂时不可用（HTTP ${error.status ?? 500}）`,
      );
  }
}

export function createZhihuClient(options: ZhihuClientOptions): ZhihuClient {
  const { secret } = options;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? ((ms: number) => delay(ms));
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

  function scrub(text: string): string {
    return redactSecrets(text, [secret]);
  }

  function urlOf(
    path: string,
    query?: Record<string, string | number>,
  ): string {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(query ?? {}))
      url.searchParams.set(key, String(value));
    return url.toString();
  }

  function headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${secret}`,
      // 秒级时间戳（调研文档 0 节：额度查询接口要求与服务端相差不超过 10 分钟）
      "X-Request-Timestamp": String(Math.floor(now().getTime() / 1000)),
      "Content-Type": "application/json",
    };
  }

  /** 请求一次：网络错误、超时、HTTP 5xx 抛 RetryableError；其余抛 ZhihuApiError */
  async function requestOnce(url: string): Promise<unknown> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // 超时自己计：假的 fetch 或某些环境不理会 abort 信号时，也不会一直等下去
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new RetryableError("timeout"));
      }, timeoutMs);
    });
    const response = (async (): Promise<unknown> => {
      let result: Response;
      try {
        result = await fetchImpl(url, {
          method: "GET",
          headers: headers(),
          credentials: "omit",
          signal: controller.signal,
        });
      } catch {
        throw new RetryableError(
          controller.signal.aborted ? "timeout" : "network",
        );
      }
      const status = result.status;
      if (status < 200 || status >= 300) {
        // 不读正文，及时放掉连接
        await result.body?.cancel().catch(() => undefined);
        if (status >= 500) throw new RetryableError("server", status);
        throw new ZhihuApiError(
          `知乎开放平台请求失败（HTTP ${status}）`,
          status,
        );
      }
      try {
        return await result.json();
      } catch {
        throw new ZhihuApiError("知乎开放平台返回的内容不是 JSON");
      }
    })();

    try {
      return await Promise.race([response, timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      controller.abort();
    }
  }

  /** 带退避重试的请求（只有网络错误、超时、5xx 才重试） */
  async function transport(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await requestOnce(url);
      } catch (error) {
        if (!(error instanceof RetryableError)) throw error;
        const backoff = RETRY_DELAYS_MS[attempt];
        if (backoff === undefined) throw exhausted(error);
        await sleep(backoff);
      }
    }
  }

  /** 统一响应外层 { Code, Message, Data }：Code 为 0 才算成功 */
  function parseEnvelope(payload: unknown): unknown {
    const body = record(payload);
    const code = body?.["Code"];
    if (typeof code !== "number" || !Number.isFinite(code))
      throw new ZhihuApiError("知乎开放平台返回的格式不对");
    if (code === 0) return body?.["Data"];
    throw businessError(code, body?.["Message"]);
  }

  return {
    async get(path, query) {
      try {
        return parseEnvelope(await transport(urlOf(path, query)));
      } catch (error) {
        if (error instanceof ZhihuAuthenticationError) throw error;
        if (error instanceof ZhihuApiError) {
          const message = scrub(error.message);
          throw message === error.message
            ? error
            : new ZhihuApiError(message, error.code);
        }
        throw new ZhihuApiError(scrub("知乎开放平台请求失败"));
      }
    },
  };
}
