import { addDays, daysBetween, diffDays, weekStartOf } from "../dates/index.ts"
import { formatDay, formatDayShort, formatWeekRange, weekdayLabel } from "../format/index.ts"
import type { Account, DayKey, Work } from "../types/index.ts"
import { followersAt, sumFlow } from "./common.ts"
import type { MetricId, MetricResult, MetricsInput, RangeId, SeriesPoint } from "./types.ts"

function scopeAccounts(input: MetricsInput, scope: string): Account[] {
  return scope === "all" ? input.accounts : input.accounts.filter((account) => account.id === scope)
}

function follows(input: MetricsInput, accounts: Account[], day: DayKey): number {
  return accounts.reduce((sum, account) => sum + followersAt(input.dataset, account.id, day), 0)
}

function countPublished(works: Work[], accountIds: Set<string>, start: DayKey, end: DayKey): number {
  return works.filter(
    (work) =>
      work.status === "done" &&
      Boolean(work.publishedAt) &&
      accountIds.has(work.accountId) &&
      work.publishedAt !== undefined &&
      work.publishedAt >= start &&
      work.publishedAt <= end,
  ).length
}

function rangeStart(input: MetricsInput, range: RangeId): DayKey {
  return range === "4w" ? addDays(input.dataset.latestDay, -27) : addDays(weekStartOf(input.dataset.latestDay), -77)
}

export function metricSeries(input: MetricsInput, scope: string, metric: MetricId, range: RangeId): MetricResult {
  const { dataset, works } = input
  const accounts = scopeAccounts(input, scope)
  const ids = new Set(accounts.map((account) => account.id))
  const valueOf = (start: DayKey, end: DayKey): number => {
    if (metric === "followers") return follows(input, accounts, end)
    if (metric === "posts") return countPublished(works, ids, start, end)
    const key = metric === "reads" ? "reads" : "interactions"
    return accounts.reduce((sum, account) => sum + sumFlow(dataset, account.id, start, end, key), 0)
  }

  let points: SeriesPoint[]
  if (range === "4w") {
    points = daysBetween(rangeStart(input, range), dataset.latestDay).map((day) => {
      const previous = addDays(day, -28)
      return {
        key: day,
        label: formatDayShort(day),
        title: `${formatDay(day, dataset.today)} ${weekdayLabel(day)}`,
        value: valueOf(day, day),
        compare: valueOf(previous, previous),
      }
    })
  } else {
    const thisWeek = weekStartOf(dataset.latestDay)
    points = Array.from({ length: 12 }, (_, index) => {
      const week = addDays(thisWeek, -7 * (11 - index))
      const end = addDays(week, 6) > dataset.latestDay ? dataset.latestDay : addDays(week, 6)
      const previousWeek = addDays(week, -84)
      const previousEnd = addDays(previousWeek, diffDays(end, week))
      const partialLatestWeek = week === thisWeek && end < addDays(week, 6)
      return {
        key: week,
        label: formatDayShort(week),
        title: partialLatestWeek ? `${formatWeekRange(week)}（到${formatDay(end, dataset.today)}）` : formatWeekRange(week),
        value: valueOf(week, end),
        compare: valueOf(previousWeek, previousEnd),
      }
    })
  }

  const start = rangeStart(input, range)
  let value: number
  let change: number | null
  if (metric === "followers") {
    value = follows(input, accounts, dataset.latestDay)
    const base = follows(input, accounts, addDays(start, -1))
    change = base > 0 ? (value - base) / base : null
  } else {
    value = valueOf(start, dataset.latestDay)
    const length = diffDays(dataset.latestDay, start) + 1
    const previous = valueOf(addDays(start, -length), addDays(start, -1))
    change = previous > 0 ? (value - previous) / previous : null
  }
  return { metric, value, change, points }
}
