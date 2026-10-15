import { minDay } from "../dates/index.ts"
import { PLATFORMS } from "../catalog/index.ts"
import { formatCount } from "../format/index.ts"
import type { Account, DayKey, MetricDef, MetricsDataset, PlatformId, Work } from "../types/index.ts"
import { secondaryValue } from "./secondary.ts"

export type FlowKey = "reads" | "interactions" | "posts"

export function followersOn(dataset: MetricsDataset, accountId: string, day: DayKey): number | null {
  const cutoff = minDay(day, dataset.latestDay)
  let result: { day: DayKey; followers: number | null } | undefined
  for (const point of dataset.daily[accountId] ?? []) {
    if (point.day <= cutoff && point.followers !== null && (!result || point.day > result.day)) result = point
  }
  return result?.followers ?? null
}

/** 粉丝数：仅沿用目标日期之前最近一次观测；首次观测之前和从未观测均为 null。 */
export function followersAt(dataset: MetricsDataset, accountId: string, day: DayKey): number | null {
  return followersOn(dataset, accountId, day)
}

export function sumFlow(dataset: MetricsDataset, accountId: string, start: DayKey, end: DayKey, key: FlowKey): number {
  return (dataset.daily[accountId] ?? []).reduce((sum, point) => sum + (point.day >= start && point.day <= end ? point[key] : 0), 0)
}

export function shortTitle(title: string): string {
  return title.split("：")[0] ?? title
}

export function accountLabel(account: Account): string {
  return `${account.name}（${PLATFORMS[account.platform].name}）`
}

export function metricsOf(platform: PlatformId): MetricDef[] {
  return PLATFORMS[platform].metrics
}

export function metricText(work: Work, platform: PlatformId, key: string): string {
  if (!work.totals || !PLATFORMS[platform].metrics.some((metric) => metric.key === key)) return "—"
  return formatCount(work.totals[key] ?? 0)
}

export function reachAndInteractions(work: Work, platform: PlatformId): { reach: number; interactions: number } {
  const definitions = PLATFORMS[platform].metrics
  const totals = work.totals ?? {}
  return {
    reach: totals[definitions[0]?.key ?? ""] ?? 0,
    // 第二个数按平台定（secondary.ts）：知乎是互动，博客是访客
    interactions: secondaryValue(PLATFORMS[platform], totals),
  }
}

export function publishedWorks(works: Work[], accountId?: string): Work[] {
  return works.filter((work) => work.status === "done" && Boolean(work.publishedAt) && (!accountId || work.accountId === accountId))
}

export function rankableWorks(works: Work[], accountId?: string): Work[] {
  return publishedWorks(works, accountId).filter((work) => work.totals !== undefined)
}
