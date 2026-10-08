import { ACCOUNTS, accountById } from "./accounts"
import { LATEST_DAY, SERIES_START, daysBetween } from "./clock"
import { seededRandom, splitInteger } from "./rng"
import type { DailyPoint, DayKey, Work } from "./types"
import { WORKS } from "./works"

/**
 * 每日数据生成器。
 * - 每个已发作品的累计阅读和互动，从发布那天到昨天按衰减曲线拆到每一天，加起来正好等于累计数；
 * - 账号每天的阅读 = 名下作品当天阅读之和 + 少量基础访问（博客首页）；
 * - 粉丝每天的增减跟当天阅读挂钩，再加一点固定种子的波动。
 * 换真数据时整个文件换成「读数据快照」。
 */

export interface WorkDay {
  day: DayKey
  reads: number
  interactions: number
}

const DECAY = 0.82
const TAIL = 0.004

const cache = new Map<string, WorkDay[]>()

/** 一个作品每天的阅读和互动；没发布或没有累计数的返回空数组 */
export function workDaily(work: Work): WorkDay[] {
  const key = `${work.id}:${work.totals?.reads ?? 0}`
  const cached = cache.get(key)
  if (cached) return cached
  let result: WorkDay[] = []
  if (work.status === "done" && work.publishedAt && work.totals && work.publishedAt <= LATEST_DAY) {
    const days = daysBetween(work.publishedAt, LATEST_DAY)
    const weights = days.map((_, k) => DECAY ** k + TAIL)
    const reads = splitInteger(work.totals.reads, weights)
    const interactions = splitInteger(work.totals.likes + work.totals.collects + work.totals.comments, weights)
    result = days.map((day, i) => ({ day, reads: reads[i], interactions: interactions[i] }))
  }
  cache.set(key, result)
  return result
}

/** 序列开始那天的粉丝数 */
const START_FOLLOWERS: Record<string, number> = {
  "zhihu-yiye": 3_600,
  "blog-chaosyn": 118,
  "bili-yiye": 0,
  "xhs-yiye": 0,
}

function followerGain(accountId: string, reads: number, random: () => number): number {
  switch (accountId) {
    case "zhihu-yiye":
      return Math.max(0, Math.round(4 + reads * 0.011 + (random() - 0.5) * 6))
    case "blog-chaosyn":
      return Math.round(reads * 0.0025 + random() * 0.8)
    case "bili-yiye":
      return Math.round(random() * 2.2)
    default:
      return Math.round(random() * 0.7)
  }
}

function buildDaily(accountId: string): DailyPoint[] {
  const account = accountById(accountId)
  const start = account.since > SERIES_START ? account.since : SERIES_START
  const days = daysBetween(start, LATEST_DAY)
  const reads = new Map<DayKey, number>()
  const interactions = new Map<DayKey, number>()
  const posts = new Map<DayKey, number>()
  for (const work of WORKS) {
    if (work.accountId !== accountId) continue
    for (const item of workDaily(work)) {
      if (item.day < start) continue
      reads.set(item.day, (reads.get(item.day) ?? 0) + item.reads)
      interactions.set(item.day, (interactions.get(item.day) ?? 0) + item.interactions)
    }
    if (work.status === "done" && work.publishedAt && work.publishedAt >= start && work.publishedAt <= LATEST_DAY) {
      posts.set(work.publishedAt, (posts.get(work.publishedAt) ?? 0) + 1)
    }
  }

  const random = seededRandom(`daily:${accountId}`)
  let followers = START_FOLLOWERS[accountId] ?? 0
  return days.map((day) => {
    let r = reads.get(day) ?? 0
    if (accountId === "blog-chaosyn") r += Math.round(40 + random() * 30)
    followers = Math.max(0, followers + followerGain(accountId, r, random))
    return { day, followers, reads: r, interactions: interactions.get(day) ?? 0, posts: posts.get(day) ?? 0 }
  })
}

/** 每个账号的每日数据，按日期升序 */
export const ACCOUNT_DAILY: Record<string, DailyPoint[]> = Object.fromEntries(
  ACCOUNTS.map((account) => [account.id, buildDaily(account.id)]),
)
