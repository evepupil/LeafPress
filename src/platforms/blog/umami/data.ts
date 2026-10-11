/**
 * 博客的拿数据工具：从 Umami 共享链接拉访问数据。
 *
 * - 账号每天：全站每天的访问（pageviews 日序列）和访客（同一次返回里的 sessions 序列，不加发请求）；
 *   接口没给某天的会话数时，那天的访客写 null。这一段每次都拉整个数据窗口：半年窗口的第一天和
 *   全站第一天有数据里较晚的那天到昨天，以前拉过的日子重写一遍，把当时还没有的访客补上；访问的数
 *   不变，记录库按天覆盖。窗口不超过 221 天，一般一次请求就够。
 * - 作品累计：每篇文章每天结束时的累计访问，昨天那条带访客（算法见 cumulative.ts、work-snapshots.ts）；
 *   查不到访问的文章昨天记一条 0。这一段照旧只拉起点到昨天。
 * - 起点（作品快照的起点）：账号里有对得上的作品还没有任何累计数据（刚导入或刚发布），或这个账号从没拉过 → 补历史，
 *   起点按发布日期收窄（见 history-start.ts）；否则从上次拉到的那天的后一天开始。
 * - 任何一步失败都整次失败，不返回半截数据。
 */
import { addDays, DATASET_DAYS, daysBetween, maxDay } from "@leafpress/core";
import type { DayKey } from "@leafpress/core";

import { redactSecrets } from "../../../config/redact.js";
import type {
  DataPullContext,
  DataPullOutcome,
  DataTool,
} from "../../types.js";
import { createUmamiClient } from "./client.js";
import {
  UmamiAuthenticationError,
  UmamiRequestError,
  UmamiShareUrlError,
} from "./errors.js";
import { historyStart } from "./history-start.js";
import { parseSiteRule, worksByArticlePath } from "./paths.js";
import { dayRangeInTimezone } from "./time.js";
import {
  readWorkSnapshots,
  type WorkSnapshotsResult,
} from "./work-snapshots.js";

export interface UmamiDataToolOptions {
  /** 等待（请求节流和退避用）；测试里换成不真等的 */
  sleep?: (milliseconds: number) => Promise<void>;
}

type PullFailure = Extract<DataPullOutcome, { ok: false }>;

function upToDate(): DataPullOutcome {
  return { ok: true, result: { account: [], works: [], note: "已是最新" } };
}

/** 失败的统一写法：共享链接失效要让用例标成过期，其余写清原因 */
function pullFailure(error: unknown, secrets: readonly string[]): PullFailure {
  if (error instanceof UmamiAuthenticationError) {
    return {
      ok: false,
      reason: "Umami 共享链接打不开了（可能被关掉或换了）",
      fixHint: "在 Umami 后台重新生成共享链接，填到接入里",
      expiredKey: "umami-share",
    };
  }
  if (error instanceof UmamiShareUrlError) {
    return {
      ok: false,
      reason: error.message,
      fixHint: "在账号详情 · 接入里重新填共享链接",
    };
  }
  if (error instanceof UmamiRequestError)
    return { ok: false, reason: redactSecrets(error.message, secrets) };
  const detail = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    reason: `Umami 数据读取失败：${redactSecrets(detail, secrets)}`,
  };
}

function pullNote(
  works: WorkSnapshotsResult,
  historyDays: number | undefined,
): string {
  let note = `入库 ${works.written} 篇文章`;
  if (historyDays !== undefined) note += `，补了 ${historyDays} 天历史`;
  if (works.shrunk.length > 0)
    note += `；${works.shrunk.length} 篇文章的访问数比已有记录小（Umami 可能清掉了旧数据，或文章地址改过），这次没覆盖：${works.shrunk.join("、")}`;
  return note;
}

async function pullFromUmami(
  ctx: DataPullContext,
  options: UmamiDataToolOptions,
): Promise<DataPullOutcome> {
  const shareUrl = ctx.secret("umami-share")?.trim();
  if (!shareUrl) {
    return {
      ok: false,
      reason: "Umami 共享链接还没配",
      fixHint: "在账号详情 · 接入里填",
    };
  }
  const site = parseSiteRule(ctx.setting("site-url"));
  if (!site) {
    return {
      ok: false,
      reason: "站点地址的格式不对",
      fixHint: "在账号详情 · 接入里改成完整网址，比如 https://blog.example.com",
    };
  }

  const yesterday = addDays(ctx.today, -1);
  const windowStart = addDays(ctx.today, -DATASET_DAYS);
  const tracked = worksByArticlePath(ctx.works, ctx.account.id, site);
  // 还没有任何累计数据的作品（刚导入或刚发布）：要给它补历史
  const freshWorks = [...tracked.values()]
    .flat()
    .filter((work) => !work.totalsDay);
  const backfill = ctx.lastSnapshotDay === undefined || freshWorks.length > 0;

  // 上次拉到的后一天。离得太远（超出半年窗口）的天用不上，从窗口第一天算
  const dayAfterLastPull =
    ctx.lastSnapshotDay === undefined
      ? undefined
      : maxDay(addDays(ctx.lastSnapshotDay, 1), windowStart);
  // 作品快照的起点。平常就从那天开始；补历史要先看过日序列才知道从哪天开始
  let start: DayKey | undefined = backfill ? undefined : dayAfterLastPull;
  if (start !== undefined && start > yesterday) return upToDate();

  try {
    const client = createUmamiClient({
      fetch: ctx.fetch,
      shareUrl,
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    });
    // 账号每天每次都拉整个数据窗口（半年窗口第一天到昨天）：以前拉过的日子重写一遍，
    // 把当时还没有的访客补上；访问的数不变，记录库按天覆盖
    const series = await client.pageviews(
      dayRangeInTimezone(windowStart).startAt,
      dayRangeInTimezone(yesterday).endAt,
    );
    const visitsByDay = new Map(
      series.map((point) => [point.day, point.pageviews]),
    );
    // 第二个数：当天访客（会话数）；接口没给那天的会话数就写 null
    const visitorsByDay = new Map(
      series.map((point) => [point.day, point.sessions] as const),
    );
    // 全站第一天有数据的日期（不早于窗口第一天）；整个窗口都没有数据就没什么可写的
    const firstDataDay = daysBetween(windowStart, yesterday).find(
      (day) => (visitsByDay.get(day) ?? 0) > 0,
    );
    if (firstDataDay === undefined) return upToDate();
    if (backfill) {
      start = historyStart({
        firstDataDay,
        freshPublishedDays: freshWorks.map((work) => work.publishedAt),
        dayAfterLastPull,
        yesterday,
      });
    }
    if (start === undefined) return upToDate();

    // 账号每天：从窗口第一天和全站第一天有数据里较晚的那天（就是 firstDataDay）到昨天，一天不缺
    const account = daysBetween(firstDataDay, yesterday).map((day) => ({
      day,
      followers: null,
      reads: visitsByDay.get(day) ?? 0,
      interactions: visitorsByDay.get(day) ?? null,
    }));

    const days = daysBetween(start, yesterday);

    const works: WorkSnapshotsResult =
      tracked.size === 0
        ? { snapshots: [], written: 0, shrunk: [] }
        : await readWorkSnapshots({
            client,
            site,
            tracked,
            start,
            yesterday,
            windowPageviews: days.reduce(
              (sum, day) => sum + (visitsByDay.get(day) ?? 0),
              0,
            ),
            progress: backfill
              ? (message) => {
                  try {
                    ctx.progress?.(message);
                  } catch {
                    // 进度只是给人看的提示，打不出来不该让拉取失败
                  }
                }
              : undefined,
          });

    return {
      ok: true,
      result: {
        account,
        works: works.snapshots,
        note: pullNote(works, backfill ? days.length : undefined),
      },
    };
  } catch (error) {
    return pullFailure(error, [shareUrl]);
  }
}

export function createUmamiDataTool(
  options: UmamiDataToolOptions = {},
): DataTool {
  return { pull: (ctx) => pullFromUmami(ctx, options) };
}
