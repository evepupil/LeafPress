/**
 * 单篇创作数据（creator_content_stats，调研文档 2 节）的解析。全部「待实测」的形状处理都集中在这个文件，
 * 实测后只改这里。
 *
 * 两条假设（官方文档没写清，官方示例只给了一条 Items[] 带一个 Metrics 含一个 Date）：
 *
 * 假设一：带起止日期（StartDate、EndDate）请求时，返回的形状是下面两种之一——
 *   A. 每天一条：Items 里每行的 Metrics.Date 各不相同（每天一个快照）；
 *   B. 整段合计：只返回一条，Date 只有一个（或没有 Date）。这时没法拆出每天，解析结果返回 undefined，
 *      调用方据此跳过补历史，从这次开始记。
 *
 * 假设二：不带日期请求时，返回的是「发布以来的累计数」。如果同时带了 Today 嵌套（今日指标），
 * 说明累计里混着今天（还没结束）的数，累计要减掉 Today 的部分，才是截止昨天的累计。
 * 没带 Today 就当成已经是截止昨天的累计。
 *
 * 数值可选：没返回的指标不写、不补 0（调研文档 1.7 节）。
 */
import type { DayKey } from "@leafpress/core";

import { ZhihuApiError } from "./errors.js";

/** 平台数据项（WorkTotals 的键）→ 单篇接口 Metrics 的字段名 */
export const METRIC_FIELDS = {
  views: "ViewCount",
  likes: "UpvoteCount",
  collects: "CollectCount",
  comments: "CommentCount",
  shares: "ShareCount",
} as const;

/** 平台数据项的键，照平台目录 metrics 的顺序 */
export type ZhihuMetricKey = keyof typeof METRIC_FIELDS;

/** 一天的各项累计（只含有返回值的项；没返回的不补 0） */
export type MetricTotals = Partial<Record<ZhihuMetricKey, number>>;

export interface ContentStatsDay {
  day: DayKey;
  totals: MetricTotals;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** 数值：可选字段没返回（null、undefined、非数）就是没有，不补 0 */
function metricOf(
  metrics: Record<string, unknown> | undefined,
  field: string,
): number | undefined {
  const value = metrics?.[field];
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 从一段 Metrics 里取出我们认的几项；一项都没有返回 undefined */
function totalsOf(
  metrics: Record<string, unknown> | undefined,
): MetricTotals | undefined {
  const totals: MetricTotals = {};
  for (const [key, field] of Object.entries(METRIC_FIELDS)) {
    const value = metricOf(metrics, field);
    if (value !== undefined) totals[key as ZhihuMetricKey] = value;
  }
  return Object.keys(totals).length > 0 ? totals : undefined;
}

function dayOf(value: unknown): DayKey | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : undefined;
}

/** 从响应（可能是外层 { Code, Message, Data }，也可能直接是 Data）里读出 Items 数组 */
function itemsOf(payload: unknown): Record<string, unknown>[] {
  const data = record(payload);
  const body =
    data !== undefined && Array.isArray(data["Items"])
      ? data
      : record(data?.["Data"]);
  const items = body?.["Items"];
  if (!Array.isArray(items))
    throw new ZhihuApiError("知乎单篇创作数据返回的格式不对");
  return items.filter((item): item is Record<string, unknown> => {
    const entry = record(item);
    return entry !== undefined && record(entry["Metrics"]) !== undefined;
  });
}

/**
 * 带起止日期的响应 → 每天的累计（按日期升序）。
 * 返回 undefined 表示「只有一条整段合计」，拆不出每天，调用方跳过补历史。
 * 同一天出现多行（不该有）时按最后一行；日期升序排序后返回。
 */
export function parseDailySeries(
  payload: unknown,
): ContentStatsDay[] | undefined {
  const rows = itemsOf(payload);
  const byDay = new Map<DayKey, MetricTotals>();
  let dated = 0;
  for (const item of rows) {
    const metrics = record(item["Metrics"]);
    const day = dayOf(metrics?.["Date"]);
    const totals = totalsOf(metrics);
    if (day === undefined || totals === undefined) continue;
    byDay.set(day, totals);
    dated += 1;
  }
  if (dated <= 1) return undefined;
  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, totals]) => ({ day, totals }));
}

/**
 * 不带日期的响应 → 截止昨天的累计。
 * - Items 为空数组：这篇没有统计数据（空数组 ≠ 各指标为零），返回 undefined；
 * - 有「今日」数（Metrics.Today）时，累计减掉 Today 的部分；
 * - 一项指标都没返回：undefined（调用方跳过这篇）。
 */
export function parseCumulative(payload: unknown): MetricTotals | undefined {
  const rows = itemsOf(payload);
  if (rows.length === 0) return undefined;
  const metrics = record(rows[0]?.["Metrics"]);
  const totals = totalsOf(metrics);
  if (totals === undefined) return undefined;
  const today = record(metrics?.["Today"]);
  if (today === undefined) return totals;

  const result: MetricTotals = {};
  let any = false;
  for (const key of Object.keys(totals) as ZhihuMetricKey[]) {
    const total = totals[key];
    if (total === undefined) continue;
    const field = METRIC_FIELDS[key];
    const todays = metricOf(today, field);
    const value = todays === undefined ? total : total - todays;
    if (value >= 0) {
      result[key] = value;
      any = true;
    }
  }
  return any ? result : undefined;
}
