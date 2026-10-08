import { ACCOUNTS, PLATFORMS } from "@/data/accounts"
import { LATEST_DAY, THIS_WEEK, addDays, diffDays } from "@/data/clock"
import { WEEKLY_NOTES } from "@/data/notes"
import { workDaily } from "@/data/series"
import type { Account, DayKey, WeeklyNote, Work } from "@/data/types"
import { formatCount, formatSigned, formatSignedPercent, weekdayLabel } from "./format"
import { type RankedWork, accountLabel, followersOn, minDay, publishedWorks, rankedWork, shortTitle, sumFlow, summaryOf } from "./metrics"

/**
 * 周报：一周里每个账号的粉丝、发布、浏览，加几句客观的小结。读的是数据快照。
 * 不设目标、不给建议：要分析就让 AI 拉数据自己分析。
 */

export interface WeekRow {
  account: Account
  /** 这个号有没有数据（拿数据的工具还没做的号没有），没有时页面上的数字显示「—」 */
  hasData: boolean
  followersStart: number
  followersEnd: number
  delta: number
  posts: number
  /** 主数据合计：浏览 / 访问 / 播放 */
  reads: number
  interactions: number
  /** 这一周主数据最多的作品和它这一周的主数据 */
  best: { item: RankedWork; weekReads: number } | null
}

export interface WeekReport {
  week: DayKey
  /** 统计到哪天：完整的周是周日，本周是昨天 */
  end: DayKey
  complete: boolean
  rows: WeekRow[]
  totals: { delta: number; posts: number; reads: number; interactions: number }
  /** 浏览比上一周 */
  readsChange: number | null
  /** 这一周发出的作品 */
  published: RankedWork[]
  digest: string[]
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
      hasData: summaryOf(account.id).hasData,
      followersStart: start,
      followersEnd: finish,
      delta: finish - start,
      posts: works.filter((work) => work.publishedAt && work.publishedAt >= week && work.publishedAt <= end).length,
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
      reads: sum.reads + row.reads,
      interactions: sum.interactions + row.interactions,
    }),
    { delta: 0, posts: 0, reads: 0, interactions: 0 },
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
  digest.push(totals.posts > 0 ? `${lead}发了 ${totals.posts} 篇：${breakdown}。` : `${lead}还没有发布。`)
  const gainer = rows.filter((row) => row.hasData).sort((a, b) => b.delta - a.delta)[0]
  if (gainer) digest.push(`粉丝合计 ${formatSigned(totals.delta)}，其中${accountLabel(gainer.account)}${formatSigned(gainer.delta)}。`)
  const best = rows
    .map((row) => row.best)
    .filter((item): item is NonNullable<WeekRow["best"]> => item !== null)
    .sort((a, b) => b.weekReads - a.weekReads)[0]
  digest.push(
    `浏览 ${formatCount(totals.reads)}，比上周 ${formatSignedPercent(readsChange)}` +
      (best ? `；《${shortTitle(best.item.work.title)}》最多（${formatCount(best.weekReads)}）。` : "。"),
  )
  for (const row of rows) {
    const summary = summaryOf(row.account.id)
    if (row.account.stage !== "active" || !summary.lastPublishedAt) continue
    const idle = diffDays(end, summary.lastPublishedAt)
    if (idle > 14) digest.push(`${row.account.name} 已经 ${idle} 天没更新，${row.account.audienceLabel} ${formatSigned(row.delta)}。`)
  }

  return {
    week,
    end,
    complete,
    rows,
    totals,
    readsChange,
    published,
    digest,
    note: WEEKLY_NOTES.find((note) => note.week === week) ?? null,
  }
}
