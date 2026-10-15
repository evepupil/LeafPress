import type { Account, DayKey, MetricsDataset, Work } from "../types/index.ts"

export interface MetricsInput {
  dataset: MetricsDataset
  accounts: Account[]
  works: Work[]
}

export interface RankedWork {
  work: Work
  account: Account
  reach: number
  interactions: number
  growth: number
  rate: number | null
}

export interface AccountSummary {
  account: Account
  hasData: boolean
  /** 这个账号的数据集中是否至少有一次非空粉丝观测 */
  followersKnown: boolean
  /** 当前日期没有观测值，或近 7/30 天、周增减的任一端缺值时为 null */
  followers: number | null
  followers7d: number | null
  followers30d: number | null
  /** 记录库里真正有数的最后一天，窗口里没有记录为 null */
  dataThrough: DayKey | null
  reads7d: number
  readsChange: number | null
  interactions7d: number
  postsThisWeek: number
  works: number
  lastPublishedAt: DayKey | null
  daysSincePublish: number | null
  weeklyGain: (number | null)[]
  stale: boolean
}

export type MetricId = "followers" | "reads" | "interactions" | "posts"
export type RangeId = "4w" | "12w"

export interface SeriesPoint {
  /** 这一点从哪天算起：按天的点是那一天，按周的点是那一周的周一 */
  key: string
  label: string
  /** 给人看的说明（图上悬停提示用），和 label、key、end 重复，命令行的 JSON 里不带 */
  title: string
  /** 这一点算到哪天：按天的点同 key；按周的点是周日，最后一周没过完时是数据的最后一天 */
  end: DayKey
  value: number | null
  compare: number | null
}

export interface MetricResult {
  metric: MetricId
  /** 选中的账号里有没有哪个拿得到这一项。目前只有粉丝会是 false（选中的账号都没有粉丝观测）：这时 value 和粉丝 points 为 null */
  available: boolean
  value: number | null
  change: number | null
  points: SeriesPoint[]
}
