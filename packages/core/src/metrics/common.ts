import { minDay } from "../dates/index.ts"
import { PLATFORMS } from "../catalog/index.ts"
import { formatCount } from "../format/index.ts"
import type { Account, DayKey, MetricDef, MetricsDataset, PlatformId, Work } from "../types/index.ts"

export type FlowKey = "reads" | "interactions" | "posts"

export function followersOn(dataset: MetricsDataset, accountId: string, day: DayKey): number | null {
  const cutoff = minDay(day, dataset.latestDay)
  let result: { day: DayKey; followers: number | null } | undefined
  for (const point of dataset.daily[accountId] ?? []) {
    if (point.day <= cutoff && point.followers !== null && (!result || point.day > result.day)) result = point
  }
  return result?.followers ?? null
}

export function followersAt(dataset: MetricsDataset, accountId: string, day: DayKey): number {
  const atDay = followersOn(dataset, accountId, day)
  if (atDay !== null) return atDay
  const first = (dataset.daily[accountId] ?? []).find((point) => point.followers !== null)
  return first?.followers ?? 0
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
    interactions: definitions.filter((metric) => metric.interaction).reduce((sum, metric) => sum + (totals[metric.key] ?? 0), 0),
  }
}

export function publishedWorks(works: Work[], accountId?: string): Work[] {
  return works.filter((work) => work.status === "done" && Boolean(work.publishedAt) && (!accountId || work.accountId === accountId))
}

export function rankableWorks(works: Work[], accountId?: string): Work[] {
  return publishedWorks(works, accountId).filter((work) => work.totals !== undefined)
}
