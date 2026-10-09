/**
 * 知乎拿数据（创作者账号数据 + 每篇内容的累计数据）。接口见 docs/调研/知乎开放平台接口.md，
 * 取数节奏见 docs/模块设计/平台适配-知乎.md「拿数据」一节：
 *
 * - 一天只拉一次：lastSnapshotDay（账号上次拉到的最后一天，即昨天收盘的记录日）已到昨天就直接
 *   「已是最新」，不发请求；
 * - 账号数（粉丝、昨日阅读）creator_account_stats 一次；作品每篇 creator_content_stats 一次，
 *   都用规范化后的 https 链接请求；
 * - 账号那一行记在昨天（数据是昨天收盘的，属于哪天就记哪天）；
 * - 作品快照记「昨天收盘」的累计；从没记过（没有 totalsDay）且窗口没盖住发布日的，再用起止日期补一段
 *   历史：累计(d) = 累计(昨天) − Σ 当天(d+1…昨天)，减出负数或按日期下降 → 整次失败不写库；
 * - 每次运行最多 90 次请求（1 次账号 + 每篇 1 次，补历史再 1 次）：窗口盖不住的排后面轮流，这次没拉到的下次接着轮；
 * - 整次失败不写半截：所有快照先攒在内存，全部成功才一次返回。
 */
import { addDays, DATASET_DAYS, diffDays, maxDay } from "@leafpress/core";

import {
  parseCumulative,
  parseDailySeries,
  type ContentStatsDay,
} from "./api/content-stats.js";
import { backfillRows } from "./api/backfill.js";
import { createZhihuClient, type ZhihuClient } from "./api/client.js";
import { ZhihuApiError, ZhihuAuthenticationError } from "./api/errors.js";
import { zhihuRefOf, zhihuWorks } from "./api/url.js";
import type {
  DataPullContext,
  DataPullContext as PullContext,
  DataPullOutcome,
  DataPullResult,
  DataTool,
} from "../types.js";
import type { DayKey, Work, WorkTotals } from "@leafpress/core";

/** 每次拉数据最多发出的请求数（官方成功次数额度一般够 90 次上下，一次拉完一个账号） */
export const MAX_REQUESTS_PER_PULL = 90;

const SETUP_HINT = "在账号详情 · 接入里填";
const REGENERATE_HINT =
  "在知乎开放平台个人中心重新生成 Access Secret，填到接入里";

interface ZhihuDataToolOptions {
  /** 等待（目前只在重试退避用，客户端默认自己等）；测试里换成不真等的 */
  sleep?: (milliseconds: number) => Promise<void>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** 账号创作数据（调研文档 1 节）：粉丝、昨日阅读。数据是昨天的，行也记在昨天 */
function accountRowOf(
  payload: unknown,
  yesterday: DayKey,
): DataPullResult["account"] {
  const data = record(payload);
  const metrics = record(data?.["Metrics"]);
  const followers = record(data?.["Followers"]);
  const row: DataPullResult["account"][number] = {
    day: yesterday,
    followers: null,
  };
  const followerTotal = followers?.["Total"];
  if (typeof followerTotal === "number" && Number.isFinite(followerTotal))
    row.followers = followerTotal;
  const yesterdayMetrics = record(metrics?.["Yesterday"]);
  const reads = yesterdayMetrics?.["ViewCount"];
  if (typeof reads === "number" && Number.isFinite(reads)) row.reads = reads;
  return [row];
}

/** 一篇的累计快照（昨天的收盘） */
interface WorkSnapshot {
  workId: string;
  url: string;
  publishedAt?: DayKey;
  totalsDay?: DayKey;
  existing?: WorkTotals;
}

function snapshotsOf(works: readonly Work[]): WorkSnapshot[] {
  return zhihuWorks(works).map((work) => ({
    workId: work.id,
    // 请求用规范化后的链接；认不出的本来就不在 zhihuWorks 里
    url: zhihuRefOf(work.url)?.url ?? "",
    publishedAt: work.publishedAt,
    totalsDay: work.totalsDay,
    existing: work.totals,
  }));
}

/** 这篇这次要不要补历史：没记过累计，且窗口起点还晚于发布日（更早发布的补不了也不必补） */
function backfillStart(
  work: WorkSnapshot,
  windowStart: DayKey,
): DayKey | undefined {
  if (work.totalsDay !== undefined) return undefined;
  if (work.publishedAt === undefined) return windowStart;
  return maxDay(work.publishedAt, windowStart);
}

/** 排队顺序：从没拉过的在前，其余按 totalsDay 从旧到新（数字越小越早） */
function byRecency(left: WorkSnapshot, right: WorkSnapshot): number {
  const leftAge = left.totalsDay ?? "";
  const rightAge = right.totalsDay ?? "";
  return leftAge < rightAge ? -1 : leftAge > rightAge ? 1 : 0;
}

/**
 * 补历史的任务清单（一次最多 90 次请求里放得下的部分）。
 * 每项：这篇，历史从哪天起补，这次花几次请求（不带日期 1 次，补历史再 1 次）。
 */
interface PlannedWork {
  snapshot: WorkSnapshot;
  backfillFrom?: DayKey;
  cost: number;
}

function planQueue(
  snapshots: readonly WorkSnapshot[],
  yesterday: DayKey,
  windowStart: DayKey,
): PlannedWork[] {
  const queue = snapshots
    .map((snapshot) => {
      const backfillFrom =
        diffDays(backfillStart(snapshot, windowStart) ?? "", "") >= 0
          ? backfillStart(snapshot, windowStart)
          : undefined;
      const needsBackfill =
        backfillFrom !== undefined && backfillFrom < yesterday;
      return { snapshot, backfillFrom, cost: needsBackfill ? 2 : 1 };
    })
    .sort((left, right) => byRecency(left.snapshot, right.snapshot));

  // 账号那次请求也算在 90 里
  let budget = MAX_REQUESTS_PER_PULL - 1;
  const planned: PlannedWork[] = [];
  for (const item of queue) {
    if (item.cost > budget) continue;
    budget -= item.cost;
    planned.push(item);
  }
  return planned;
}

/** 补历史：拿带日期的每天一段数，往回减出每天的收盘累计（api/backfill.ts）；减出负数或下降拖不一致错 */
function backfillSnapshot(
  snapshot: WorkSnapshot,
  series: readonly ContentStatsDay[],
  yesterdayTotal: WorkTotals,
  yesterday: DayKey,
): DataPullResult["works"] {
  const start = snapshot.publishedAt ?? seriesStart(series);
  return backfillRows({
    workId: snapshot.workId,
    start,
    yesterday,
    yesterdayTotal,
    series,
  }).map((row) => ({
    workId: snapshot.workId,
    day: row.day,
    totals: row.totals,
  }));
}

/** 带日期的响应里最早的一天：没发布日可参照时，补到这天为止 */
function seriesStart(series: readonly ContentStatsDay[]): DayKey {
  return series[0]?.day ?? "0000-00-00";
}

async function pull(
  ctx: PullContext,
  options: ZhihuDataToolOptions,
): Promise<DataPullOutcome> {
  const secret = ctx.secret("access-secret")?.trim();
  if (!secret)
    return {
      ok: false,
      reason: "开放平台密钥还没配",
      fixHint: SETUP_HINT,
    };

  const yesterday = addDays(ctx.today, -1);
  if (ctx.lastSnapshotDay === yesterday)
    return {
      ok: true,
      result: {
        account: [],
        works: [],
        note: "知乎今天已经拉过了，不用再拉",
      },
    };

  const client: ZhihuClient = createZhihuClient({
    secret,
    fetch: ctx.fetch,
    sleep: options.sleep,
    now: () => ctx.now,
  });
  const windowStart = addDays(ctx.today, -DATASET_DAYS);
  const accountRows: DataPullResult["account"] = [];
  const workRows: DataPullResult["works"] = [];

  try {
    // 1. 账号数（数据是昨天收盘的，行记在昨天）
    accountRows.push(
      ...accountRowOf(
        await client.get("/user/creator_account_stats"),
        yesterday,
      ),
    );

    // 2. 作品快照（按预算排队，放不下的下次轮）
    const queue = planQueue(snapshotsOf(ctx.works), yesterday, windowStart);
    let done = 0;
    for (const plan of queue) {
      done += 1;
      ctx.progress?.(`知乎内容 ${done}/${queue.length}：${plan.snapshot.url}`);
      const payload = await client.get("/user/creator_content_stats", {
        ContentUrl: plan.snapshot.url,
      });
      const cumulative = parseCumulative(payload);
      if (cumulative === undefined) continue;
      const totals: WorkTotals = { ...cumulative };
      if (plan.backfillFrom === undefined || plan.backfillFrom >= yesterday) {
        workRows.push({
          workId: plan.snapshot.workId,
          day: yesterday,
          totals,
        });
        continue;
      }
      // 补历史（多花一次请求）
      const historyPayload = await client.get("/user/creator_content_stats", {
        ContentUrl: plan.snapshot.url,
        StartDate: plan.backfillFrom,
        EndDate: yesterday,
      });
      const series = parseDailySeries(historyPayload);
      workRows.push(
        ...(series === undefined
          ? [
              {
                workId: plan.snapshot.workId,
                day: yesterday,
                totals,
              },
            ]
          : backfillSnapshot(plan.snapshot, series, totals, yesterday)),
      );
    }
  } catch (error) {
    if (error instanceof ZhihuAuthenticationError)
      return {
        ok: false,
        reason: error.message,
        fixHint: REGENERATE_HINT,
        expiredKey: "access-secret",
      };
    const reason =
      error instanceof ZhihuApiError ? error.message : "知乎拿数据失败";
    return { ok: false, reason, fixHint: "过一会儿再试一次" };
  }

  const total = snapshotsOf(ctx.works).length;
  const articles = ctx.works.filter((work) =>
    (work.url ?? "").includes("zhuanlan.zhihu.com/p/"),
  ).length;
  const answers = total - articles;
  let note = `知乎入库 ${total} 篇（文章 ${articles}、回答 ${answers}）`;
  const skipped = total - queueLength(ctx);
  if (skipped > 0)
    note += `；这次拉了 ${total - skipped} 篇，${skipped} 篇下次轮到`;
  return { ok: true, result: { account: accountRows, works: workRows, note } };
}

function queueLength(ctx: PullContext): number {
  const yesterday = addDays(ctx.today, -1);
  return planQueue(
    snapshotsOf(ctx.works),
    yesterday,
    addDays(ctx.today, -DATASET_DAYS),
  ).length;
}

export function createZhihuDataTool(
  options: ZhihuDataToolOptions = {},
): DataTool {
  return { pull: (ctx) => pull(ctx, options) };
}

export type { DataPullContext };
