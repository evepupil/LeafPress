/**
 * 知乎开放平台客户端：创作者接口共用的鉴权、超时、重试和错误码处理。
 * 地址、请求头、参数、错误码一律照 docs/调研/知乎开放平台接口.md。
 *
 * - 认证（调研文档 0 节）：`Authorization: Bearer <Access Secret>`、`X-Request-Timestamp`（秒级
 *   Unix 时间戳，不是毫秒）、`Content-Type: application/json`，GET 也带。除这两个头外没有别的签名。
 * - 限流间隔：相邻两次请求至少隔 1.1 秒（实测 0.7 秒内连发 3 次即触发每秒限流，间隔 1.3 秒稳定
 *   通过），从本客户端上次发出请求算起；时钟和等待都可注入，测试里不真等。
 * - 超时：单次请求 15 秒。
 * - 重试：网络错误（含超时）和 HTTP 5xx 按 1 秒、3 秒退避重试两次；每秒超限（Code 30001 且
 *   Message 带 second）和偶发失败（Code 90001，实测隔几秒重试同一请求就成功）等 2 秒重试同一
 *   请求，最多 3 次，仍失败才报错；错误文字把「每秒超限」「当天额度用完」「接口偶发失败」
 *   分开说，并带上接口的 Message。
 * - 其余业务错误码（响应体里的 Code）一律不重试，直接失败并说清原因：
 *   30001（Message 不带 second）才是当天额度用完、30002 额外成功次数额度耗尽、30003 风控拒绝——
 *   这几种再试也是同样的结果，重试只会白白再耗额度；20001 密钥不对，抛 ZhihuAuthenticationError。
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
/** 相邻两次请求至少隔这么久（实测 0.7 秒内连发 3 次即触发每秒限流，间隔 1.3 秒稳定通过） */
const REQUEST_INTERVAL_MS = 1_100;
/** 每秒超限、偶发失败重试同一请求的等待和次数（90001 实测隔几秒重试就成功） */
const BUSINESS_RETRY_DELAY_MS = 2_000;
const BUSINESS_RETRY_LIMIT = 3;

/** 值得再试一次的请求失败：网络错误、超时、HTTP 5xx、每秒超限、偶发失败 */
class RetryableError extends Error {
  constructor(
    readonly kind: "network" | "timeout" | "server" | "business",
    readonly status?: number,
    /** 业务重试失败到底用的 Code 和接口 Message（再试仍失败时写进错误文字） */
    readonly code?: number,
    readonly apiMessage?: unknown,
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
  /** 等待（限流间隔、退避重试用）；测试里换成不真等的 */
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
  const detail = detailOf(message);
  switch (code) {
    case 10001:
      return new ZhihuApiError(
        "知乎开放平台说参数错误或内容不可用（10001）",
        code,
      );
    case 30001:
      // 带 second 的 30001（每秒超限）在信封解析时就拦下重试了，到这里的才是当天额度用完
      return new ZhihuApiError(
        `知乎开放平台今天的额度用完了（30001）${detail}`,
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
      // 能重试的 90001（偶发失败）在信封解析时就拦下重试了，到这里的当普通错误看
      return new ZhihuApiError("知乎开放平台服务内部错误（90001）", code);
    default:
      return new ZhihuApiError(
        `知乎开放平台返回错误（${code}${detail}）`,
        code,
      );
  }
}

/** Message 带 second 的 30001 是每秒超限，不是当天额度用完（实测第 1 条） */
function secondLimited(message: unknown): boolean {
  return (
    typeof message === "string" && message.toLowerCase().includes("second")
  );
}

/** 接口回的 Message 拼进错误文字；没有就不拼 */
function detailOf(message: unknown): string {
  return typeof message === "string" && message !== "" ? `：${message}` : "";
}

/** 每秒超限、偶发失败重试仍失败：跟其余业务错误分开说，带上接口的 Message */
function businessExhausted(
  code: number | undefined,
  message: unknown,
): ZhihuApiError {
  const detail = detailOf(message);
  if (code === 30001)
    return new ZhihuApiError(
      `知乎开放平台限流（每秒调用次数超了），重试 3 次仍不行${detail}`,
      code,
    );
  return new ZhihuApiError(
    `知乎开放平台请求失败（90001），重试 3 次仍不行${detail}`,
    90001,
  );
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
    case "business":
      return businessExhausted(error.code, error.apiMessage);
  }
}

export function createZhihuClient(options: ZhihuClientOptions): ZhihuClient {
  const { secret } = options;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? ((ms: number) => delay(ms));
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  // 限流间隔从上次发出请求算起：相邻两次请求至少隔 REQUEST_INTERVAL_MS（实测第 1 条）
  let lastRequestAt = Number.NEGATIVE_INFINITY;

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

  /** 请求一次：网络错误、超时、HTTP 5xx 抛 RetryableError；其余抛 ZhihuApiError。
   *  发出前先等到离上次请求至少 REQUEST_INTERVAL_MS（第一次不等） */
  async function requestOnce(url: string): Promise<unknown> {
    const last = lastRequestAt;
    if (Number.isFinite(last)) {
      const wait = REQUEST_INTERVAL_MS - (now().getTime() - last);
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt = now().getTime();
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

  /** 带重试的请求：网络错误、超时、5xx 按 1 秒、3 秒退避重试两次；每秒超限、偶发失败
   *  （信封解析里抛 RetryableError("business")）等 2 秒重试同一请求，最多 3 次，
   *  再试仍失败才报错，其余错误照原样抛出 */
  async function transport(url: string): Promise<unknown> {
    let backoffAttempt = 0;
    let businessRetries = 0;
    for (;;) {
      try {
        return parseEnvelope(await requestOnce(url));
      } catch (error) {
        if (!(error instanceof RetryableError)) throw error;
        if (error.kind === "business") {
          businessRetries += 1;
          if (businessRetries > BUSINESS_RETRY_LIMIT) throw exhausted(error);
          await sleep(BUSINESS_RETRY_DELAY_MS);
          continue;
        }
        const backoff = RETRY_DELAYS_MS[backoffAttempt];
        backoffAttempt += 1;
        if (backoff === undefined) throw exhausted(error);
        await sleep(backoff);
      }
    }
  }

  /** 统一响应外层 { Code, Message, Data }：Code 为 0 才算成功；
   *  每秒超限（30001 + Message 带 second）和偶发失败（90001）先不报错，交给外面重试 */
  function parseEnvelope(payload: unknown): unknown {
    const body = record(payload);
    const code = body?.["Code"];
    if (typeof code !== "number" || !Number.isFinite(code))
      throw new ZhihuApiError("知乎开放平台返回的格式不对");
    if (code === 0) return body?.["Data"];
    if (code === 90001 || (code === 30001 && secondLimited(body?.["Message"])))
      throw new RetryableError("business", undefined, code, body?.["Message"]);
    throw businessError(code, body?.["Message"]);
  }

  return {
    async get(path, query) {
      try {
        return await transport(urlOf(path, query));
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
