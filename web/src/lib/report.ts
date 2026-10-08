import { ACCOUNTS, PLATFORMS } from "@/data/accounts"
import { LATEST_DAY, THIS_WEEK, addDays, diffDays } from "@/data/clock"
import { WEEKLY_NOTES } from "@/data/notes"
import { workDaily } from "@/data/series"
import type { Account, DayKey, WeeklyNote, Work } from "@/data/types"
import { formatCount, formatSigned, formatSignedPercent, weekdayLabel } from "./format"
import {
  type RankedWork,
  accountLabel,
  columnRows,
  minDay,
  publishedWorks,
  rankedWork,
  shortTitle,
  sumFlow,
  followersOn,
  summaryOf,
} from "./metrics"

/** 周报：一周里每个账号的粉丝、发布、阅读，加几句小结和建议。读的是数据快照 */

export interface WeekRow {
  account: Account
  followersStart: number
  followersEnd: number
  delta: number
  posts: number
  /** 只有运营中的号算目标 */
  target: number
  reads: number
  interactions: number
  /** 这一周阅读最多的作品和它这一周的阅读 */
  best: { item: RankedWork; weekReads: number } | null
}

export interface WeekReport {
  week: DayKey
  /** 统计到哪天：完整的周是周日，本周是昨天 */
  end: DayKey
  complete: boolean
  rows: WeekRow[]
  totals: { delta: number; posts: number; target: number; reads: number; interactions: number }
  /** 阅读比上一周 */
  readsChange: number | null
  /** 这一周发出的作品 */
  published: RankedWork[]
  digest: string[]
  suggestions: string[]
  note: WeeklyNote | null
}

/** 周报能看的周：本周和之前 8 周，新的在前 */
export const REPORT_WEEKS: DayKey[] = Array.from({ length: 9 }, (_, i) => addDays(THIS_WEEK, -7 * i))

function readsBetween(work: Work, start: DayKey, end: DayKey): number {
  return workDaily(work)
    .filter((item) => item.day >= start && item.day <= end)
    .reduce((sum, item) => sum + item.reads, 0)
}

function weekRows(week: DayKey, end: DayKey): WeekRow[] {
  return ACCOUNTS.filter((account) => account.since <= end).map((account) => {
    const start = followersOn(account.id, addDays(week, -1)) ?? 0
    const finish = followersOn(account.id, end) ?? 0
    const works = publishedWorks(account.id)
    let best: WeekRow["best"] = null
    for (const work of works) {
      const weekReads = readsBetween(work, week, end)
      if (weekReads > 0 && (!best || weekReads > best.weekReads)) best = { item: rankedWork(work), weekReads }
    }
    return {
      account,
      followersStart: start,
      followersEnd: finish,
      delta: finish - start,
      posts: works.filter((work) => work.publishedAt && work.publishedAt >= week && work.publishedAt <= end).length,
      target: account.stage === "active" ? account.goals.postsPerWeek : 0,
      reads: sumFlow(account.id, week, end, "reads"),
      interactions: sumFlow(account.id, week, end, "interactions"),
      best,
    }
  })
}

function sumRows(rows: WeekRow[]) {
  return rows.reduce(
    (sum, row) => ({
      delta: sum.delta + row.delta,
      posts: sum.posts + row.posts,
      target: sum.target + row.target,
      reads: sum.reads + row.reads,
      interactions: sum.interactions + row.interactions,
    }),
    { delta: 0, posts: 0, target: 0, reads: 0, interactions: 0 },
  )
}

export function weekReport(week: DayKey): WeekReport {
  const end = minDay(addDays(week, 6), LATEST_DAY)
  const complete = addDays(week, 6) <= LATEST_DAY
  const rows = weekRows(week, end)
  const totals = sumRows(rows)
  const prevWeek = addDays(week, -7)
  const prevTotals = sumRows(weekRows(prevWeek, addDays(prevWeek, diffDays(end, week))))
  const readsChange = prevTotals.reads > 0 ? (totals.reads - prevTotals.reads) / prevTotals.reads : null
  const published = publishedWorks()
    .filter((work) => work.publishedAt && work.publishedAt >= week && work.publishedAt <= end)
    .map(rankedWork)
    .sort((a, b) => (a.work.publishedAt ?? "").localeCompare(b.work.publishedAt ?? "") || a.work.id.localeCompare(b.work.id))

  const digest: string[] = []
  const breakdown = rows
    .filter((row) => row.posts > 0)
    .map((row) => `${PLATFORMS[row.account.platform].name} ${row.posts} 篇`)
    .join("、")
  const lead = complete ? "这周" : `本周到${weekdayLabel(end)}`
  digest.push(
    totals.posts > 0
      ? `${lead}发了 ${totals.posts} 篇，目标 ${totals.target} 篇：${breakdown}。`
      : `${lead}还没有发布，目标 ${totals.target} 篇。`,
  )
  const gainer = [...rows].sort((a, b) => b.delta - a.delta)[0]
  if (gainer) digest.push(`粉丝合计 ${formatSigned(totals.delta)}，其中${accountLabel(gainer.account)}${formatSigned(gainer.delta)}。`)
  const best = rows
    .map((row) => row.best)
    .filter((item): item is NonNullable<WeekRow["best"]> => item !== null)
    .sort((a, b) => b.weekReads - a.weekReads)[0]
  digest.push(
    `阅读 ${formatCount(totals.reads)}，比上周 ${formatSignedPercent(readsChange)}` +
      (best ? `；《${shortTitle(best.item.work.title)}》最多（${formatCount(best.weekReads)}）。` : "。"),
  )
  for (const row of rows) {
    const summary = summaryOf(row.account.id)
    if (row.account.stage !== "active" || !summary.lastPublishedAt) continue
    const idle = diffDays(end, summary.lastPublishedAt)
    if (idle > 14) digest.push(`${row.account.name} 已经 ${idle} 天没更新，${row.account.audienceLabel} ${formatSigned(row.delta)}。`)
  }

  const suggestions: string[] = []
  if (complete) {
    for (const row of rows) {
      if (row.target > 0 && row.posts < row.target) {
        suggestions.push(`${accountLabel(row.account)}发了 ${row.posts} 篇，比目标少 ${row.target - row.posts} 篇。`)
      }
    }
  }
  const zhihuColumns = columnRows("zhihu-yiye", end)
  const bestColumn = [...zhihuColumns].filter((row) => row.avgReads !== null).sort((a, b) => (b.avgReads ?? 0) - (a.avgReads ?? 0))[0]
  if (bestColumn?.avgReads) {
    suggestions.push(`「${bestColumn.column.name}」近 12 周平均每篇阅读 ${formatCount(bestColumn.avgReads)}，是表现最好的栏目。`)
  }
  const empty = zhihuColumns.filter((row) => row.works === 0).map((row) => `「${row.column.name}」`)
  if (empty.length > 0) suggestions.push(`${empty.join("")}近 12 周还没发过，离计划占比差得最多。`)

  return {
    week,
    end,
    complete,
    rows,
    totals,
    readsChange,
    published,
    digest,
    suggestions,
    note: WEEKLY_NOTES.find((note) => note.week === week) ?? null,
  }
}
