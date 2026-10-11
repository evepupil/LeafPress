/**
 * 单篇创作数据（creator_content_stats，调研文档 2 节）的解析。实测（2026-10-10，
 * .fleet/briefs/m3-zhihu-real-api.md 第 4、5 条）后的形状处理都集中在这个文件。
 *
 * - 只用不带日期的请求：带起止日期的只回一条整段合计（Metrics 里没有 Date），拆不出每天，
 *   所以不再发那种请求，也没有逐日补历史；
 * - 不带日期时返回 1 条：Items[0].Metrics 是到现在为止的累计（含今天），同一个 Metrics 里
 *   嵌着 Today、Yesterday，分别是今天、昨天当天的数。昨天的收盘累计 = 各项 − Today 同名项；
 *   前天的收盘累计 = 再减 Yesterday 同名项；
 * - Today / Yesterday 里没有的项不减；前天那条减出负数、或 Yesterday 一项都没给，都不写；
 * - 数值可选：没返回的指标不写、不补 0（调研文档 1.7 节）。
 */
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

/** 一篇不带日期的响应解析出的快照 */
export interface ContentStats {
  /** 昨天收盘的累计 */
  yesterday: MetricTotals;
  /** 前天收盘的累计：第一次拉这篇时能补的全部历史；Yesterday 没给或减出负数就没有 */
  dayBefore?: MetricTotals;
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
 * 从一段累计里减掉另一段（Today / Yesterday）同名项的值；那段里没有的项不减。
 * strict 为 true 时减出负数就整段作废（前天那条不写）；为 false 时负数的项丢弃、
 * 其余照用（个别项对不上时不至于整篇作废）。requireAny 为 true 时那段一项都没给
 * 也返回 undefined（拿不到前天的数，不硬造一条和昨天一样的）。
 * 一项都不剩返回 undefined。
 */
function minusSpan(
  totals: MetricTotals,
  span: Record<string, unknown> | undefined,
  options: { strict: boolean; requireAny?: boolean },
): MetricTotals | undefined {
  const result: MetricTotals = {};
  let any = false;
  let subtracted = false;
  for (const key of Object.keys(totals) as ZhihuMetricKey[]) {
    const total = totals[key];
    if (total === undefined) continue;
    const spent = metricOf(span, METRIC_FIELDS[key]);
    if (spent !== undefined) subtracted = true;
    const value = spent === undefined ? total : total - spent;
    if (value < 0) {
      if (options.strict) return undefined;
      continue;
    }
    result[key] = value;
    any = true;
  }
  if (!any) return undefined;
  if (options.requireAny === true && !subtracted) return undefined;
  return result;
}

/**
 * 不带日期的响应 → 昨天的收盘累计（和第一次拉这篇时前天的收盘累计）。
 * - Items 为空数组：这篇没有统计数据（空数组 ≠ 各指标为零），返回 undefined；
 * - 一项指标都没返回（或减 Today 后一项不剩）：undefined，调用方跳过这篇；
 * - options.dayBefore 为 true 时顺带算前天（Metrics.Yesterday 再减一遍），
 *   没给 Yesterday 或减出负数就没有前天那条。
 */
export function parseContentStats(
  payload: unknown,
  options: { dayBefore?: boolean } = {},
): ContentStats | undefined {
  const rows = itemsOf(payload);
  if (rows.length === 0) return undefined;
  const metrics = record(rows[0]?.["Metrics"]);
  const cumulative = totalsOf(metrics);
  if (cumulative === undefined) return undefined;
  const yesterday = minusSpan(cumulative, record(metrics?.["Today"]), {
    strict: false,
  });
  if (yesterday === undefined) return undefined;
  const stats: ContentStats = { yesterday };
  if (options.dayBefore) {
    const dayBefore = minusSpan(yesterday, record(metrics?.["Yesterday"]), {
      strict: true,
      requireAny: true,
    });
    if (dayBefore !== undefined) stats.dayBefore = dayBefore;
  }
  return stats;
}
