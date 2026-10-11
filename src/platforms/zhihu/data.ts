/**
 * 知乎拿数据（创作者账号数据 + 每篇内容的累计数据）。接口见 docs/调研/知乎开放平台接口.md，
 * 取数节奏见 docs/模块设计/平台适配-知乎.md「拿数据」一节（2026-10-10 实测后的做法）：
 *
 * - 一天只拉一次：lastSnapshotDay（账号上次拉到的最后一天，即昨天收盘的记录日）已到昨天
 *   就直接「已是最新」，一个请求都不发；
 * - 拉之前先查一次额度（GET /quota?APIIDs=creator，查询本身不占额度、也不算在本次用量里）：
 *   本次最多用 RemainingQuota − 10 次请求；查不到按 90 次兜底；
 * - 账号数（粉丝、昨日阅读）creator_account_stats 一次，行记在昨天（数据是昨天收盘的，
 *   属于哪天就记哪天）；作品每篇 creator_content_stats 一次，用规范化后的 https 链接、
 *   不带日期请求（带起止日期的只回一条整段合计，拆不出每天，不再发）；
 * - 作品快照记「昨天收盘」：Metrics（到现在的累计，含今天）− Today 同名项；第一次拉这篇
 *   （它还没有快照）时多写一条前天 = 再减 Yesterday 同名项，减出负数不写。知乎拿不到
 *   逐日历史，更早的天补不了；
 * - 预算装不下的排后面轮流：从没拉过的在前，其余按快照日期从旧到新，这次没拉到的下次接着轮；
 * - 整次失败不写半截：所有快照先攒在内存，全部成功才一次返回。
 */
import { addDays } from "@leafpress/core";
import type { DayKey, Work } from "@leafpress/core";

import { parseContentStats } from "./api/content-stats.js";
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

/** 查不到额度时的兜底：本次拉数据最多发出的请求数 */
export const MAX_REQUESTS_PER_PULL = 90;

/** 查到额度也留出的余量：本次最多用 RemainingQuota − 10 次，免得把当天的额度用见底 */
const QUOTA_HEADROOM = 10;

const SETUP_HINT = "在账号详情 · 接入里填";
const REGENERATE_HINT =
  "在知乎开放平台个人中心重新生成 Access Secret，填到接入里";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** 账号创作数据（调研文档 1 节，实测第 6 条）：粉丝、昨日阅读。数据是昨天的，行也记在昨天 */
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
  const reads = record(metrics?.["Yesterday"])?.["ViewCount"];
  if (typeof reads === "number" && Number.isFinite(reads)) row.reads = reads;
  return [row];
}

/** 一篇的快照对象：请求用规范化后的链接，认不出的本来就不在 zhihuWorks 里 */
interface WorkSnapshot {
  workId: string;
  url: string;
  /** 上次拉到的最后一天；从没拉过（第一次拉这篇）时没有 */
  totalsDay?: DayKey;
}

function snapshotsOf(works: readonly Work[]): WorkSnapshot[] {
  return zhihuWorks(works).map((work) => ({
    workId: work.id,
    url: zhihuRefOf(work.url)?.url ?? "",
    totalsDay: work.totalsDay,
  }));
}

/** 排队顺序：从没拉过的在前，其余按 totalsDay 从旧到新（数字越小越早） */
function byRecency(left: WorkSnapshot, right: WorkSnapshot): number {
  const leftAge = left.totalsDay ?? "";
  const rightAge = right.totalsDay ?? "";
  return leftAge < rightAge ? -1 : leftAge > rightAge ? 1 : 0;
}

/** 额度查询（实测第 3 条）：creator 额度项的剩余次数；失败或形状不对返回 undefined（按兜底算） */
async function remainingQuota(
  client: ZhihuClient,
): Promise<number | undefined> {
  try {
    const rowsRaw = await client.get("/quota", { APIIDs: "creator" });
    const rows: unknown[] = Array.isArray(rowsRaw) ? rowsRaw : [];
    const creator = rows.find((row) => record(row)?.["APIID"] === "creator");
    const remaining = record(creator)?.["RemainingQuota"];
    return typeof remaining === "number" && Number.isFinite(remaining)
      ? remaining
      : undefined;
  } catch (error) {
    // 密钥不对要照常报出来（标成过期），其余失败只影响额度的算法，按兜底走
    if (error instanceof ZhihuAuthenticationError) throw error;
    return undefined;
  }
}

/** 本次最多发出的请求数：查到额度按剩余减余量（至少 0），查不到按 90 兜底 */
function budgetOf(remaining: number | undefined): number {
  return remaining === undefined
    ? MAX_REQUESTS_PER_PULL
    : Math.max(remaining - QUOTA_HEADROOM, 0);
}

async function pull(ctx: PullContext): Promise<DataPullOutcome> {
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

  const fetchOfContext = ctx.fetch;
  const client: ZhihuClient = createZhihuClient({
    secret,
    fetch: fetchOfContext,
    // 接口限流要留间隔；没给（比如旧调用方）时客户端用自己的等待
    sleep: async (ms) => {
      await ctx.sleep?.(ms);
    },
    now: () => ctx.now,
  });
  const accountRows: DataPullResult["account"] = [];
  const workRows: DataPullResult["works"] = [];
  let pulledCount = 0;

  try {
    // 0. 额度：先查一次（不占额度、不算用量），按剩余定本次最多用几次
    const budget = budgetOf(await remainingQuota(client));
    if (budget < 1)
      return {
        ok: false,
        reason: "知乎开放平台今天的额度剩得不多了，这次不拉",
        fixHint: "额度每天 0 点重置，明天再拉",
      };

    // 1. 账号数（数据是昨天收盘的，行记在昨天）
    accountRows.push(
      ...accountRowOf(
        await client.get("/user/creator_account_stats"),
        yesterday,
      ),
    );

    // 2. 作品快照（每篇 1 次请求；预算装不下的下次轮）
    const queue = snapshotsOf(ctx.works)
      .sort(byRecency)
      .slice(0, budget - 1);
    pulledCount = queue.length;
    let done = 0;
    for (const snapshot of queue) {
      done += 1;
      ctx.progress?.(`知乎内容 ${done}/${queue.length}：${snapshot.url}`);
      const payload = await client.get("/user/creator_content_stats", {
        ContentUrl: snapshot.url,
      });
      const stats = parseContentStats(payload, {
        dayBefore: snapshot.totalsDay === undefined,
      });
      if (stats === undefined) continue;
      // 第一次拉这篇多写一条前天（Yesterday 里没有或减出负数就没有这条）
      if (stats.dayBefore !== undefined)
        workRows.push({
          workId: snapshot.workId,
          day: addDays(yesterday, -1),
          totals: { ...stats.dayBefore },
        });
      workRows.push({
        workId: snapshot.workId,
        day: yesterday,
        totals: { ...stats.yesterday },
      });
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
  const skipped = total - pulledCount;
  if (skipped > 0)
    note += `；这次拉了 ${pulledCount} 篇，${skipped} 篇下次轮到`;
  return { ok: true, result: { account: accountRows, works: workRows, note } };
}

export function createZhihuDataTool(): DataTool {
  return { pull: (ctx) => pull(ctx) };
}

export type { DataPullContext };
