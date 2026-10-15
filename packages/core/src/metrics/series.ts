import { addDays, daysBetween, diffDays, weekStartOf } from "../dates/index.ts"
import { formatDay, formatDayShort, formatWeekRange, weekdayLabel } from "../format/index.ts"
import { PLATFORMS } from "../catalog/index.ts"
import type { Account, DayKey, Work } from "../types/index.ts"
import { followersAt, sumFlow } from "./common.ts"
import { followersKnown } from "./coverage.ts"
import { combinedSecondary } from "./secondary.ts"
import type { MetricId, MetricResult, MetricsInput, RangeId, SeriesPoint } from "./types.ts"

function scopeAccounts(input: MetricsInput, scope: string): Account[] {
  return scope === "all" ? input.accounts : input.accounts.filter((account) => account.id === scope)
}

/** 只合计目标日期已有观测的账号；尚无账号观测时返回 null。 */
function follows(input: MetricsInput, accounts: Account[], day: DayKey): number | null {
  const values = accounts.map((account) => followersAt(input.dataset, account.id, day)).filter((value): value is number => value !== null)
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null
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
  // 粉丝线只算拿得到粉丝数的账号；选中的账号一个都拿不到时，这一项标成没有（available: false）
  const followerAccounts = accounts.filter((account) => followersKnown(dataset, account.id))
  const available = metric !== "followers" || followerAccounts.length > 0
  // 几个账号合在一起算第二个数时，访客和互动不能相加：只合计 combinedSecondary 包含的账号（见 secondary.ts）
  const secondaryCombined = combinedSecondary(accounts.map((account) => PLATFORMS[account.platform]))
  const secondaryAccounts = accounts.filter((account) => secondaryCombined.includes(PLATFORMS[account.platform]))
  const valueOf = (start: DayKey, end: DayKey): number | null => {
    if (metric === "followers") return follows(input, followerAccounts, end)
    if (metric === "posts") return countPublished(works, ids, start, end)
    const key = metric === "reads" ? "reads" : "interactions"
    const flowAccounts = metric === "interactions" ? secondaryAccounts : accounts
    return flowAccounts.reduce((sum, account) => sum + sumFlow(dataset, account.id, start, end, key), 0)
  }

  let points: SeriesPoint[]
  if (range === "4w") {
    points = daysBetween(rangeStart(input, range), dataset.latestDay).map((day) => {
      const previous = addDays(day, -28)
      return {
        key: day,
        label: formatDayShort(day),
        title: `${formatDay(day, dataset.today)} ${weekdayLabel(day)}`,
        end: day,
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
        end,
        value: valueOf(week, end),
        compare: valueOf(previousWeek, previousEnd),
      }
    })
  }

  const start = rangeStart(input, range)
  let value: number | null
  let change: number | null
  if (metric === "followers") {
    value = follows(input, followerAccounts, dataset.latestDay)
    const base = follows(input, followerAccounts, addDays(start, -1))
    change = value !== null && base !== null && base > 0 ? (value - base) / base : null
  } else {
    value = valueOf(start, dataset.latestDay) ?? 0
    const length = diffDays(dataset.latestDay, start) + 1
    const previous = valueOf(addDays(start, -length), addDays(start, -1)) ?? 0
    change = previous > 0 ? (value - previous) / previous : null
  }
  return { metric, available, value, change, points }
}
