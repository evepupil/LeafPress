import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import { LATEST_DAY, THIS_WEEK, TODAY, addDays, daysBetween, diffDays } from "@/data/clock"
import { ACCOUNT_DAILY, reachAndInteractions, workDaily } from "@/data/series"
import type { Account, DayKey, MetricDef, Work } from "@/data/types"
import { WORKS } from "@/data/works"
import { formatCount, formatDay, formatDayShort, formatWeekRange, weekdayLabel } from "./format"

/**
 * 数据页、账号页、周报要的统计：账号概况、走势、作品排行。只客观算数，不设目标；要分析让 AI 拉数据自己分析。
 * 读的是数据快照（src/data，相当于每天定时拉回来的数据），不读页面上正在改的作品；
 * 同样的输入每次结果相同，期望值见 metrics.test.ts。
 */

// ---------- 基础 ----------

function daily(accountId: string) {
  return ACCOUNT_DAILY[accountId] ?? []
}

export function minDay(a: DayKey, b: DayKey): DayKey {
  return a < b ? a : b
}

/** 某天结束时的粉丝数；那天还没开号返回 null；晚于最新一天按最新一天算 */
export function followersOn(accountId: string, day: DayKey): number | null {
  const points = daily(accountId)
  if (points.length === 0 || day < points[0].day) return null
  const index = diffDays(minDay(day, LATEST_DAY), points[0].day)
  return points[index]?.followers ?? null
}

export type FlowKey = "reads" | "interactions" | "posts"

/** 一段日子（含两端）里某项数据之和 */
export function sumFlow(accountId: string, start: DayKey, end: DayKey, key: FlowKey): number {
  let total = 0
  for (const point of daily(accountId)) {
    if (point.day >= start && point.day <= end) total += point[key]
  }
  return total
}

/** 作品标题冒号前的部分，用在一句话里 */
export function shortTitle(title: string): string {
  return title.split("：")[0]
}

export function platformName(accountId: string): string {
  return PLATFORMS[accountById(accountId).platform].name
}

/** 「一叶之桐（知乎）」 */
export function accountLabel(account: Account): string {
  return `${account.name}（${PLATFORMS[account.platform].name}）`
}

/** 作品所在平台的数据项（各平台不一样，第一项是主数据） */
export function metricsOf(work: Work): MetricDef[] {
  return PLATFORMS[accountById(work.accountId).platform].metrics
}

/** 作品的一项数据显示成文字；没发、或这个平台没有这一项的显示「—」 */
export function metricText(work: Work, key: string): string {
  if (!work.totals || !metricsOf(work).some((item) => item.key === key)) return "—"
  return formatCount(work.totals[key] ?? 0)
}

/** 已发布、有数据的作品（数据快照里的） */
export function publishedWorks(accountId?: string): Work[] {
  return WORKS.filter((work) => work.status === "done" && work.publishedAt && work.totals && (!accountId || work.accountId === accountId))
}

// ---------- 作品排行 ----------

export interface RankedWork {
  work: Work
  account: Account
  /** 主数据：浏览 / 访问 / 播放 */
  reach: number
  /** 这个平台标了互动的数据项加起来 */
  interactions: number
  /** 近 7 天新增的主数据 */
  growth: number
  /** 互动 ÷ 主数据 */
  rate: number | null
}

export function rankedWork(work: Work): RankedWork {
  const { reach, interactions } = reachAndInteractions(work)
  const from = addDays(LATEST_DAY, -6)
  const growth = workDaily(work)
    .filter((item) => item.day >= from)
    .reduce((sum, item) => sum + item.reads, 0)
  return {
    work,
    account: accountById(work.accountId),
    reach,
    interactions,
    growth,
    rate: reach > 0 ? interactions / reach : null,
  }
}

export type RankBy = "reach" | "interactions" | "growth"

/** 已发作品按某项排序，取前 limit 个 */
export function topWorks(by: RankBy, limit = 10, accountId?: string): RankedWork[] {
  return publishedWorks(accountId)
    .map(rankedWork)
    .sort((a, b) => b[by] - a[by] || b.reach - a.reach || a.work.id.localeCompare(b.work.id))
    .slice(0, limit)
}

// ---------- 账号概况 ----------

export interface AccountSummary {
  account: Account
  /** 拿到过数据没有：拿数据的工具还没做的号是 false，页面上的数字都显示「—」 */
  hasData: boolean
  followers: number
  followers7d: number
  followers30d: number
  reads7d: number
  /** 近 7 天阅读比再往前 7 天 */
  readsChange: number | null
  interactions7d: number
  /** 本周已发的作品数 */
  postsThisWeek: number
  /** 这个号上已发的作品数 */
  works: number
  lastPublishedAt: DayKey | null
  daysSincePublish: number | null
  /** 近 12 周每周的粉丝增减，最后一个是本周（到昨天） */
  weeklyGain: number[]
  /** 运营中、超过 14 天没发 */
  stale: boolean
}

export function accountSummary(accountId: string): AccountSummary {
  const account = accountById(accountId)
  const followers = followersOn(accountId, LATEST_DAY) ?? 0
  const at = (days: number) => followersOn(accountId, addDays(LATEST_DAY, -days)) ?? 0
  const reads7d = sumFlow(accountId, addDays(LATEST_DAY, -6), LATEST_DAY, "reads")
  const readsPrev = sumFlow(accountId, addDays(LATEST_DAY, -13), addDays(LATEST_DAY, -7), "reads")
  const works = publishedWorks(accountId)
  const last = works.reduce<DayKey | null>(
    (max, work) => (work.publishedAt && (!max || work.publishedAt > max) ? work.publishedAt : max),
    null,
  )
  const daysSincePublish = last ? diffDays(TODAY, last) : null
  const weeklyGain = Array.from({ length: 12 }, (_, i) => {
    const week = addDays(THIS_WEEK, -7 * (11 - i))
    const end = minDay(addDays(week, 6), LATEST_DAY)
    const start = followersOn(accountId, addDays(week, -1)) ?? 0
    return (followersOn(accountId, end) ?? 0) - start
  })
  return {
    account,
    hasData: daily(accountId).length > 0,
    followers,
    followers7d: followers - at(7),
    followers30d: followers - at(30),
    reads7d,
    readsChange: readsPrev > 0 ? (reads7d - readsPrev) / readsPrev : null,
    interactions7d: sumFlow(accountId, addDays(LATEST_DAY, -6), LATEST_DAY, "interactions"),
    postsThisWeek: works.filter((work) => work.publishedAt && work.publishedAt >= THIS_WEEK && work.publishedAt <= TODAY).length,
    works: works.length,
    lastPublishedAt: last,
    daysSincePublish,
    weeklyGain,
    stale: account.stage === "active" && daysSincePublish !== null && daysSincePublish > 14,
  }
}

export const ACCOUNT_SUMMARIES: AccountSummary[] = ACCOUNTS.map((account) => accountSummary(account.id))

export function summaryOf(accountId: string): AccountSummary {
  const summary = ACCOUNT_SUMMARIES.find((item) => item.account.id === accountId)
  if (!summary) throw new Error(`没有这个账号：${accountId}`)
  return summary
}

// ---------- 走势 ----------

export type MetricId = "followers" | "reads" | "interactions" | "posts"
export type RangeId = "4w" | "12w"

export interface SeriesPoint {
  key: string
  /** 横轴上的短标签：10/7 */
  label: string
  /** 悬停时的完整说明 */
  title: string
  value: number
  /** 上一期同位置的值 */
  compare: number | null
}

export interface MetricResult {
  metric: MetricId
  /** 页签上的大数字：粉丝取最新值，其余取这段时间的合计 */
  value: number
  /** 粉丝：这段时间的增长率；其余：比上一期 */
  change: number | null
  points: SeriesPoint[]
}

function scopeIds(scope: string): string[] {
  return scope === "all" ? ACCOUNTS.map((account) => account.id) : [scope]
}

function followersSum(ids: string[], day: DayKey): number {
  return ids.reduce((sum, id) => sum + (followersOn(id, day) ?? 0), 0)
}

function flowSum(ids: string[], start: DayKey, end: DayKey, key: FlowKey): number {
  return ids.reduce((sum, id) => sum + sumFlow(id, start, end, key), 0)
}

function rangeStart(range: RangeId): DayKey {
  return range === "4w" ? addDays(LATEST_DAY, -27) : addDays(THIS_WEEK, -77)
}

/** scope 传 "all"（全部账号）或一个账号编号 */
export function metricSeries(scope: string, metric: MetricId, range: RangeId): MetricResult {
  const ids = scopeIds(scope)
  const valueOf = (start: DayKey, end: DayKey) => (metric === "followers" ? followersSum(ids, end) : flowSum(ids, start, end, metric))

  let points: SeriesPoint[]
  if (range === "4w") {
    points = daysBetween(rangeStart("4w"), LATEST_DAY).map((day) => {
      const prev = addDays(day, -28)
      return {
        key: day,
        label: formatDayShort(day),
        title: `${formatDay(day)} ${weekdayLabel(day)}`,
        value: valueOf(day, day),
        compare: valueOf(prev, prev),
      }
    })
  } else {
    points = Array.from({ length: 12 }, (_, i) => {
      const week = addDays(THIS_WEEK, -7 * (11 - i))
      const end = minDay(addDays(week, 6), LATEST_DAY)
      const prevWeek = addDays(week, -84)
      const prevEnd = addDays(prevWeek, diffDays(end, week))
      const current = week === THIS_WEEK
      return {
        key: week,
        label: formatDayShort(week),
        title: current ? `${formatWeekRange(week)}（到${formatDay(end)}）` : formatWeekRange(week),
        value: valueOf(week, end),
        compare: valueOf(prevWeek, prevEnd),
      }
    })
  }

  const start = rangeStart(range)
  let value: number
  let change: number | null
  if (metric === "followers") {
    value = followersSum(ids, LATEST_DAY)
    const base = followersSum(ids, addDays(start, -1))
    change = base > 0 ? (value - base) / base : null
  } else {
    value = flowSum(ids, start, LATEST_DAY, metric)
    const length = diffDays(LATEST_DAY, start) + 1
    const prev = flowSum(ids, addDays(start, -length), addDays(start, -1), metric)
    change = prev > 0 ? (value - prev) / prev : null
  }
  return { metric, value, change, points }
}
