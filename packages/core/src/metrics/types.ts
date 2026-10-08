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
  key: string
  label: string
  title: string
  value: number
  compare: number | null
}

export interface MetricResult {
  metric: MetricId
  value: number
  change: number | null
  points: SeriesPoint[]
}
