/**
 * 等上线并归档链接（archive）：推送后 Cloudflare 要几分钟才上线，这里每 15 秒看一次文章地址，
 * 最多等 3 分钟，通了就把链接、发布日期、原稿位置记到作品上。
 * 没上线就失败退出，让 agent 过一会儿再跑，不长时间占着命令。
 *
 * 每次访问有四种结果，等不到上线时按最后一次的结果说清楚原因，别一律说「还没上线」：
 * - 200：上线了；
 * - 404：还没上线，继续等；
 * - 别的状态码：站点回应了，但不是文章页，说出状态码；
 * - 请求抛错（域名写错、解析不了、证书、代理、超时）：连不上，说出原因。
 * 后两种也继续等到时间用完，因为部署期间偶尔的 5xx、网络抖动过一会儿会恢复。
 */
import { join } from "node:path";

import type { CodeOutcome } from "@leafpress/core";

import type { CodeStepContext, CodeStepHandler } from "../../types.js";
import { blogStepConfig, stepFailure } from "./config.js";
import { readPublishedDay, readSlug } from "./draft.js";

/** 注入的网络请求和等待；缺省用步骤上下文里带的 */
export interface BlogArchiveDependencies {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const POLL_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_WAIT_MS = 3 * 60_000;

/** 访问一次文章地址的结果 */
type Probe =
  | { kind: "online" }
  | { kind: "missing" }
  | { kind: "status"; status: number }
  | { kind: "unreachable"; reason: string };

/** 说不清的错误对象也要给出一句能看的话；Node 的 fetch 把真正原因（解析不了、证书……）放在 cause 里 */
function describeRequestError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === "TimeoutError")
    return `${REQUEST_TIMEOUT_MS / 1000} 秒内没有响应`;
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause && cause !== error.message
    ? `${error.message}（${cause}）`
    : error.message;
}

async function probeOnce(fetcher: typeof fetch, url: string): Promise<Probe> {
  try {
    const response = await fetcher(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 不读正文，及时放掉连接；放不掉也不影响判断
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 200) return { kind: "online" };
    if (response.status === 404) return { kind: "missing" };
    return { kind: "status", status: response.status };
  } catch (error) {
    return { kind: "unreachable", reason: describeRequestError(error) };
  }
}

/** 等到时间用完还没上线时，按最后一次的结果说原因 */
function notOnlineMessage(
  ctx: Pick<CodeStepContext, "work">,
  siteUrl: string,
  last: Exclude<Probe, { kind: "online" }>,
): string {
  switch (last.kind) {
    case "unreachable":
      return `连不上 ${siteUrl}：${last.reason}`;
    case "status":
      return `${siteUrl} 返回 ${last.status}`;
    case "missing":
      return `推送了，还没上线（Cloudflare 一般要几分钟）；过两三分钟再运行 leafpress work run ${ctx.work.id}；超过半小时还不行，去 Cloudflare Pages 看部署记录`;
  }
}

export function createBlogArchiveHandler(
  dependencies: BlogArchiveDependencies = {},
): CodeStepHandler {
  return async (ctx: CodeStepContext): Promise<CodeOutcome> => {
    const configured = blogStepConfig(ctx);
    if (!configured.ok) return configured.outcome;
    const { config } = configured;

    let slug: string;
    let publishedAt: string;
    try {
      slug = await readSlug(ctx.folder);
      publishedAt = await readPublishedDay(ctx.folder);
    } catch (error) {
      return stepFailure(ctx, error);
    }

    const url = `${config.siteUrl}/posts/${slug}/`;
    const fetcher = dependencies.fetch ?? ctx.fetch;
    const wait = dependencies.sleep ?? ((ms: number) => ctx.sleep(ms));

    // 已经等了多久：睡过的时间加上请求花掉的时间
    let waitedMs = 0;
    for (;;) {
      ctx.heartbeat();
      const started = performance.now();
      const result = await probeOnce(fetcher, url);
      waitedMs += performance.now() - started;
      if (result.kind === "online") {
        return {
          kind: "done",
          url,
          publishedAt,
          localPath: join(config.repo, "content", "posts", "zh", `${slug}.mdx`),
          sourceRef: `zh/${slug}`,
          note: "已上线",
        };
      }
      if (waitedMs >= MAX_WAIT_MS) {
        return stepFailure(ctx, notOnlineMessage(ctx, config.siteUrl, result));
      }
      await wait(POLL_INTERVAL_MS);
      waitedMs += POLL_INTERVAL_MS;
    }
  };
}
