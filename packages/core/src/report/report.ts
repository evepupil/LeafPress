import { addDays, diffDays, minDay, weekStartOf } from "../dates/index.ts"
import { formatCount, formatSigned, formatSignedPercent, weekdayLabel } from "../format/index.ts"
import { PLATFORMS } from "../catalog/index.ts"
import type { Account, DayKey, MetricsDataset, WeeklyNote, Work } from "../types/index.ts"
import { accountLabel, followersAt, publishedWorks, shortTitle, sumFlow } from "../metrics/common.ts"
import { followersKnown } from "../metrics/coverage.ts"
import { rankedWork } from "../metrics/rank.ts"
import type { MetricsInput, RankedWork } from "../metrics/types.ts"

export interface WeekRow {
  account: Account
  hasData: boolean
  /** 这个号拿不拿得到粉丝数；false 时 followersStart、followersEnd、delta 的 0 只是占位，不是真的 0，显示时写「—」 */
  followersKnown: boolean
  followersStart: number
  followersEnd: number
  delta: number
  posts: number
  reads: number
  interactions: number
  best: { item: RankedWork; weekReads: number } | null
}

export interface WeekReport {
  week: DayKey
  end: DayKey
  complete: boolean
  rows: WeekRow[]
  /** 有没有哪个账号拿得到粉丝数；false 时 totals.delta 的 0 只是占位，粉丝合计显示「—」 */
  followersKnown: boolean
  /** delta 只加拿得到粉丝数的账号 */
  totals: { delta: number; posts: number; reads: number; interactions: number }
  readsChange: number | null
  published: RankedWork[]
  digest: string[]
  note: WeeklyNote | null
}

export function reportWeeks(today: DayKey, count = 9): DayKey[] {
  const current = weekStartOf(addDays(today, -1))
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(current, -7 * index))
}

function readsBetween(dataset: MetricsDataset, work: Work, start: DayKey, end: DayKey): number {
  return (dataset.workDays[work.id] ?? [])
    .filter((point) => point.day >= start && point.day <= end)
    .reduce((sum, point) => sum + point.reads, 0)
}

function sumRows(rows: WeekRow[]): WeekReport["totals"] {
  return rows.reduce(
    (sum, row) => ({
      // 粉丝合计只加拿得到粉丝数的账号
      delta: sum.delta + (row.followersKnown ? row.delta : 0),
      posts: sum.posts + row.posts,
      reads: sum.reads + row.reads,
      interactions: sum.interactions + row.interactions,
    }),
    { delta: 0, posts: 0, reads: 0, interactions: 0 },
  )
}

/**
 * 这一周的分账号表要不要列这个账号：加号那天在周末之前，或者周末之前已经有账号每天的数，或者周末之前发过作品。
 * 只看加号日期不够：博客今天才加进来，导入了旧文章、补了半年历史，过去几周其实有数、有发布，
 * 表里不列它，下面「这周发布」却列着它的文章，合计也对不上。
 */
function listedIn(input: MetricsInput, account: Account, end: DayKey): boolean {
  if (account.since <= end) return true
  if ((input.dataset.daily[account.id] ?? []).some((point) => point.day <= end)) return true
  return publishedWorks(input.works, account.id).some((work) => work.publishedAt !== undefined && work.publishedAt <= end)
}

function weekRows(input: MetricsInput, week: DayKey, end: DayKey): WeekRow[] {
  const { dataset, accounts, works } = input
  return accounts
    .filter((account) => listedIn(input, account, end))
    .map((account) => {
      const accountWorks = publishedWorks(works, account.id)
      let best: WeekRow["best"] = null
      for (const work of accountWorks) {
        const weekReads = readsBetween(dataset, work, week, end)
        if (weekReads > 0 && (!best || weekReads > best.weekReads)) {
          best = { item: rankedWork(dataset, work, account), weekReads }
        }
      }
      const followersStart = followersAt(dataset, account.id, addDays(week, -1))
      const followersEnd = followersAt(dataset, account.id, end)
      return {
        account,
        hasData: (dataset.daily[account.id]?.length ?? 0) > 0,
        followersKnown: followersKnown(dataset, account.id),
        followersStart,
        followersEnd,
        delta: followersEnd - followersStart,
        posts: accountWorks.filter((work) => work.publishedAt && work.publishedAt >= week && work.publishedAt <= end).length,
        reads: sumFlow(dataset, account.id, week, end, "reads"),
        interactions: sumFlow(dataset, account.id, week, end, "interactions"),
        best,
      }
    })
}

function latestPublished(works: Work[]): Map<string, Work> {
  const latest = new Map<string, Work>()
  for (const work of publishedWorks(works)) {
    const previous = latest.get(work.accountId)
    if (
      !previous ||
      (work.publishedAt ?? "") > (previous.publishedAt ?? "") ||
      (work.publishedAt === previous.publishedAt && work.updatedAt > previous.updatedAt)
    ) {
      latest.set(work.accountId, work)
    }
  }
  return latest
}

export function weekReport(input: MetricsInput & { notes: WeeklyNote[] }, week: DayKey): WeekReport {
  const { dataset } = input
  const end = minDay(addDays(week, 6), dataset.latestDay)
  const complete = addDays(week, 6) <= dataset.latestDay
  const rows = weekRows(input, week, end)
  const totals = sumRows(rows)
  const previousWeek = addDays(week, -7)
  const previousEnd = addDays(previousWeek, diffDays(end, week))
  const previousTotals = sumRows(weekRows(input, previousWeek, previousEnd))
  const readsChange = previousTotals.reads > 0 ? (totals.reads - previousTotals.reads) / previousTotals.reads : null
  const accounts = new Map(input.accounts.map((account) => [account.id, account]))
  const published = publishedWorks(input.works)
    .filter((work) => work.publishedAt && work.publishedAt >= week && work.publishedAt <= end)
    .flatMap((work) => {
      const account = accounts.get(work.accountId)
      return account ? [rankedWork(dataset, work, account)] : []
    })
    .sort((a, b) => (a.work.publishedAt ?? "").localeCompare(b.work.publishedAt ?? "") || a.work.id.localeCompare(b.work.id))

  const digest: string[] = []
  const breakdown = rows
    .filter((row) => row.posts > 0)
    .map((row) => `${PLATFORMS[row.account.platform].name} ${row.posts} 篇`)
    .join("、")
  const lead = complete ? "这周" : `本周到${weekdayLabel(end)}`
  digest.push(totals.posts > 0 ? `${lead}发了 ${totals.posts} 篇：${breakdown}。` : `${lead}还没有发布。`)

  // 粉丝这一句只看拿得到粉丝数的账号；一个都拿不到（比如只有博客）就不写，免得写出「粉丝合计 0」
  const gainer = rows.filter((row) => row.followersKnown).sort((a, b) => b.delta - a.delta)[0]
  if (gainer) digest.push(`粉丝合计 ${formatSigned(totals.delta)}，其中${accountLabel(gainer.account)}${formatSigned(gainer.delta)}。`)
  const best = rows
    .map((row) => row.best)
    .filter((item): item is NonNullable<WeekRow["best"]> => item !== null)
    .sort((a, b) => b.weekReads - a.weekReads)[0]
  digest.push(
    `浏览 ${formatCount(totals.reads)}，比上周 ${formatSignedPercent(readsChange)}` +
      (best ? `；《${shortTitle(best.item.work.title)}》最多（${formatCount(best.weekReads)}）。` : "。"),
  )
  const lastByAccount = latestPublished(input.works)
  for (const row of rows) {
    if (row.account.stage !== "active") continue
    const last = lastByAccount.get(row.account.id)
    if (!last?.publishedAt) continue
    const idle = diffDays(end, last.publishedAt)
    if (idle > 14) {
      // 拿不到粉丝数的号不写「订阅 +0」：那个 0 是占位
      const audience = row.followersKnown ? `，${PLATFORMS[row.account.platform].audienceLabel} ${formatSigned(row.delta)}` : ""
      digest.push(`${row.account.name} 已经 ${idle} 天没更新${audience}。`)
    }
  }

  return {
    week,
    end,
    complete,
    rows,
    followersKnown: rows.some((row) => row.followersKnown),
    totals,
    readsChange,
    published,
    digest,
    note: input.notes.find((note) => note.week === week) ?? null,
  }
}
