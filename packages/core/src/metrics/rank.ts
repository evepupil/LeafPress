import { addDays } from "../dates/index.ts"
import type { Account, MetricsDataset, Work } from "../types/index.ts"
import { reachAndInteractions, rankableWorks } from "./common.ts"
import type { MetricsInput, RankedWork } from "./types.ts"

export type RankBy = "reach" | "interactions" | "growth"

export function rankedWork(dataset: MetricsDataset, work: Work, account: Account): RankedWork {
  const { reach, interactions } = reachAndInteractions(work, account.platform)
  const from = addDays(dataset.latestDay, -6)
  const growth = (dataset.workDays[work.id] ?? [])
    .filter((point) => point.day >= from && point.day <= dataset.latestDay)
    .reduce((sum, point) => sum + point.reads, 0)
  return { work, account, reach, interactions, growth, rate: reach > 0 ? interactions / reach : null }
}

export function topWorks(input: MetricsInput, by: RankBy, limit = 10, accountId?: string): RankedWork[] {
  const accounts = new Map(input.accounts.map((account) => [account.id, account]))
  return rankableWorks(input.works, accountId)
    .flatMap((work) => {
      const account = accounts.get(work.accountId)
      return account ? [rankedWork(input.dataset, work, account)] : []
    })
    .sort((a, b) => b[by] - a[by] || b.reach - a.reach || a.work.id.localeCompare(b.work.id))
    .slice(0, Math.max(0, limit))
}
