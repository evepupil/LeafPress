import { addDays, diffDays, weekStartOf } from "../dates/index.ts"
import type { Account, DayKey, Work } from "../types/index.ts"
import { publishedWorks, sumFlow, followersAt } from "./common.ts"
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
  const reads7d = sumFlow(dataset, account.id, addDays(latest, -6), latest, "reads")
  const readsPrev = sumFlow(dataset, account.id, addDays(latest, -13), addDays(latest, -7), "reads")
  const dataWeek = weekStartOf(latest)
  const postsWeek = weekStartOf(dataset.today)
  const weeklyGain = Array.from({ length: 12 }, (_, index) => {
    const week = addDays(dataWeek, -7 * (11 - index))
    const end = week > latest ? latest : addDays(week, 6) > latest ? latest : addDays(week, 6)
    return followersAt(dataset, account.id, end) - followersAt(dataset, account.id, addDays(week, -1))
  })

  return {
    account,
    hasData: (dataset.daily[account.id]?.length ?? 0) > 0,
    followers,
    followers7d: followers - followersAt(dataset, account.id, addDays(latest, -7)),
    followers30d: followers - followersAt(dataset, account.id, addDays(latest, -30)),
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
