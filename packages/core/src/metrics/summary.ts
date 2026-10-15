import { addDays, diffDays, weekStartOf } from "../dates/index.ts"
import type { Account, DayKey, Work } from "../types/index.ts"
import { publishedWorks, sumFlow, followersAt } from "./common.ts"
import { followersKnown, lastDataDay } from "./coverage.ts"
import type { AccountSummary, MetricsInput } from "./types.ts"

export function accountSummary(input: MetricsInput, account: Account): AccountSummary {
  const { dataset, works } = input
  const latest = dataset.latestDay
  const accountWorks = publishedWorks(works, account.id)
  const lastPublished = accountWorks.reduce<DayKey | null>(
    (last, work: Work) => (work.publishedAt && (!last || work.publishedAt > last) ? work.publishedAt : last),
    null,
  )
  const daysSincePublish = lastPublished ? diffDays(dataset.today, lastPublished) : null
  const followers = followersAt(dataset, account.id, latest)
  const followersStart7d = followersAt(dataset, account.id, addDays(latest, -7))
  const followersStart30d = followersAt(dataset, account.id, addDays(latest, -30))
  const reads7d = sumFlow(dataset, account.id, addDays(latest, -6), latest, "reads")
  const readsPrev = sumFlow(dataset, account.id, addDays(latest, -13), addDays(latest, -7), "reads")
  const dataWeek = weekStartOf(latest)
  const postsWeek = weekStartOf(dataset.today)
  const weeklyGain = Array.from({ length: 12 }, (_, index) => {
    const week = addDays(dataWeek, -7 * (11 - index))
    const end = week > latest ? latest : addDays(week, 6) > latest ? latest : addDays(week, 6)
    const start = followersAt(dataset, account.id, addDays(week, -1))
    const finish = followersAt(dataset, account.id, end)
    return start !== null && finish !== null ? finish - start : null
  })

  return {
    account,
    hasData: (dataset.daily[account.id]?.length ?? 0) > 0,
    followersKnown: followersKnown(dataset, account.id),
    dataThrough: lastDataDay(dataset, account.id),
    followers,
    followers7d: followers !== null && followersStart7d !== null ? followers - followersStart7d : null,
    followers30d: followers !== null && followersStart30d !== null ? followers - followersStart30d : null,
    reads7d,
    readsChange: readsPrev > 0 ? (reads7d - readsPrev) / readsPrev : null,
    interactions7d: sumFlow(dataset, account.id, addDays(latest, -6), latest, "interactions"),
    postsThisWeek: accountWorks.filter((work) => work.publishedAt && work.publishedAt >= postsWeek && work.publishedAt <= dataset.today)
      .length,
    works: accountWorks.length,
    lastPublishedAt: lastPublished,
    daysSincePublish,
    weeklyGain,
    stale: account.stage === "active" && daysSincePublish !== null && daysSincePublish > 14,
  }
}
