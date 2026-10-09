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
  /**
   * 这个号拿不拿得到粉丝数（博客的 Umami 不给订阅数）。
   * 为 false 时 followers、followers7d、followers30d、weeklyGain 的 0 只是占位，不是真的 0，显示时写「—」
   */
  followersKnown: boolean
  /** 记录库里真正有数的最后一天，窗口里没有记录为 null。比 latestDay 早，说明最近几天没拉到，那几天的 0 是补出来的 */
  dataThrough: DayKey | null
  followers: number
  followers7d: number
  followers30d: number
  reads7d: number
  readsChange: number | null
  interactions7d: number
  postsThisWeek: number
  works: number
  lastPublishedAt: DayKey | null
  daysSincePublish: number | null
  weeklyGain: number[]
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
  value: number
  compare: number | null
}

export interface MetricResult {
  metric: MetricId
  /**
   * 选中的账号里有没有哪个拿得到这一项。目前只有粉丝会是 false（选中的账号都拿不到粉丝数）：
   * 这时 value、change、points 里的 0 只是占位，不是真的 0，界面不要给这一项，命令行写「—」
   */
  available: boolean
  value: number
  change: number | null
  points: SeriesPoint[]
}
