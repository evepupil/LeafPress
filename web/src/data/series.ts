import { ACCOUNTS, accountById } from "./accounts"
import { LATEST_DAY, SERIES_START, daysBetween, diffDays } from "./clock"
import { seededRandom, splitInteger } from "./rng"
import type { DailyPoint, DayKey, Publication } from "./types"
import { PUBLICATIONS } from "./works"

/**
 * 每日数据生成器。
 * - 每个已发版本的累计阅读和互动，从发布那天到昨天按衰减曲线拆到每一天，加起来正好等于累计数；
 * - 账号每天的阅读 = 名下版本当天阅读之和 + 少量基础访问（博客首页、公众号老文章）；
 * - 粉丝每天的增减跟当天阅读挂钩，再加一点固定种子的波动。
 * 换真数据时整个文件换成「读数据快照」。
 */

export interface PubDay {
  day: DayKey
  reads: number
  interactions: number
}

const DECAY = 0.82
const TAIL = 0.004

const pubCache = new Map<string, PubDay[]>()

/** 一个版本每天的阅读和互动；没发或没有累计数的返回空数组 */
export function pubDaily(pub: Publication): PubDay[] {
  const cached = pubCache.get(pub.id)
  if (cached) return cached
  let result: PubDay[] = []
  if (pub.state === "published" && pub.publishedAt && pub.totals && pub.publishedAt <= LATEST_DAY) {
    const days = daysBetween(pub.publishedAt, LATEST_DAY)
    const weights = days.map((_, k) => DECAY ** k + TAIL)
    const reads = splitInteger(pub.totals.reads, weights)
    const interactions = splitInteger(pub.totals.likes + pub.totals.collects + pub.totals.comments, weights)
    result = days.map((day, i) => ({ day, reads: reads[i], interactions: interactions[i] }))
  }
  pubCache.set(pub.id, result)
  return result
}

/** 序列开始那天的粉丝数 */
const START_FOLLOWERS: Record<string, number> = {
  "zhihu-yiye": 3_600,
  "blog-chaosyn": 118,
  "wechat-acg": 2_960,
  "bili-yiye": 0,
  "xhs-yiye": 0,
}

/** 公众号最后一次更新（照本机 published.db 的记录） */
export const WECHAT_LAST_ISSUE: DayKey = "2026-07-28"

function followerGain(accountId: string, day: DayKey, reads: number, random: () => number): number {
  switch (accountId) {
    case "zhihu-yiye":
      return Math.max(0, Math.round(4 + reads * 0.011 + (random() - 0.5) * 6))
    case "blog-chaosyn":
      return Math.round(reads * 0.0025 + random() * 0.8)
    case "wechat-acg":
      return day <= WECHAT_LAST_ISSUE ? Math.round(2 + random() * 4) : -Math.round(0.6 + random() * 1.6)
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
  for (const pub of PUBLICATIONS) {
    if (pub.accountId !== accountId) continue
    for (const item of pubDaily(pub)) {
      if (item.day < start) continue
      reads.set(item.day, (reads.get(item.day) ?? 0) + item.reads)
      interactions.set(item.day, (interactions.get(item.day) ?? 0) + item.interactions)
    }
    if (pub.state === "published" && pub.publishedAt && pub.publishedAt >= start && pub.publishedAt <= LATEST_DAY) {
      posts.set(pub.publishedAt, (posts.get(pub.publishedAt) ?? 0) + 1)
    }
  }

  const random = seededRandom(`daily:${accountId}`)
  let followers = START_FOLLOWERS[accountId] ?? 0
  return days.map((day) => {
    let r = reads.get(day) ?? 0
    let i = interactions.get(day) ?? 0
    let p = posts.get(day) ?? 0
    if (accountId === "blog-chaosyn") {
      r += Math.round(40 + random() * 30)
    }
    if (accountId === "wechat-acg") {
      if (day < "2026-07-27") {
        // 自动流程接手前每天一期，这些期数没有导入作品表
        const base = Math.round(300 + random() * 260)
        r += base
        i += Math.round(base * 0.06)
        p += 1
      } else if (day > WECHAT_LAST_ISSUE) {
        const tail = Math.round(60 * 0.97 ** diffDays(day, WECHAT_LAST_ISSUE) + random() * 8)
        r += tail
        i += Math.round(tail * 0.03)
      }
    }
    followers = Math.max(0, followers + followerGain(accountId, day, r, random))
    return { day, followers, reads: r, interactions: i, posts: p }
  })
}

/** 每个账号的每日数据，按日期升序 */
export const ACCOUNT_DAILY: Record<string, DailyPoint[]> = Object.fromEntries(
  ACCOUNTS.map((account) => [account.id, buildDaily(account.id)]),
)
