import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import { LATEST_DAY, THIS_WEEK, TODAY, addDays, daysBetween, diffDays, weekStartOf } from "@/data/clock"
import { ACCOUNT_DAILY, WECHAT_LAST_ISSUE, pubDaily } from "@/data/series"
import { RUNS, TOOLS, WECHAT_REVIEW_QUEUE, WECHAT_REVIEW_URL, WEEKLY_NOTES } from "@/data/tools"
import type { Account, Column, DayKey, IsoTime, PlatformId, Publication, ToolRun, WeeklyNote, Work } from "@/data/types"
import { PUBLICATIONS, WORKS, workById } from "@/data/works"
import {
  formatCount,
  formatDay,
  formatDayRelative,
  formatDayShort,
  formatSigned,
  formatSignedPercent,
  formatWeekRange,
  weekdayLabel,
} from "./format"

/**
 * 页面要的统计都在这里算：账号概况、走势、周报、排行、本周节奏、待处理。
 * 只读 src/data，不改数据；同样的输入每次结果相同，期望值见 metrics.test.ts。
 */

// ---------- 基础 ----------

function daily(accountId: string) {
  return ACCOUNT_DAILY[accountId] ?? []
}

function minDay(a: DayKey, b: DayKey): DayKey {
  return a < b ? a : b
}

/** 某天结束时的粉丝数；那天还没开号返回 null；晚于最新一天按最新一天算 */
export function followersOn(accountId: string, day: DayKey): number | null {
  const points = daily(accountId)
  if (points.length === 0 || day < points[0].day) return null
  const index = diffDays(minDay(day, LATEST_DAY), points[0].day)
  return points[index]?.followers ?? null
}

export type FlowKey = "reads" | "interactions" | "posts"

/** 一段日子（含两端）里某项数据之和 */
export function sumFlow(accountId: string, start: DayKey, end: DayKey, key: FlowKey): number {
  let total = 0
  for (const point of daily(accountId)) {
    if (point.day >= start && point.day <= end) total += point[key]
  }
  return total
}

/** 作品标题冒号前的部分，用在一句话里 */
export function shortTitle(title: string): string {
  return title.split("：")[0]
}

export function platformName(accountId: string): string {
  return PLATFORMS[accountById(accountId).platform].name
}

/** 「一叶之桐（知乎）」 */
export function accountLabel(account: Account): string {
  return `${account.name}（${PLATFORMS[account.platform].name}）`
}

const SUPPORTED: Record<PlatformId, ("likes" | "collects" | "comments")[]> = {
  blog: ["comments"],
  zhihu: ["likes", "collects", "comments"],
  wechat: ["likes", "comments"],
  bilibili: ["likes", "collects", "comments"],
  xiaohongshu: ["likes", "collects", "comments"],
}

/** 版本的一项数据显示成文字；没发、或这个平台没有这一项的显示「—」 */
export function metricText(pub: Publication, key: "reads" | "likes" | "collects" | "comments"): string {
  if (!pub.totals) return "—"
  if (key !== "reads" && !SUPPORTED[accountById(pub.accountId).platform].includes(key)) return "—"
  return formatCount(pub.totals[key])
}

// ---------- 版本排行 ----------

export interface RankedPub {
  pub: Publication
  work: Work
  account: Account
  reads: number
  interactions: number
  /** 近 7 天新增阅读 */
  growth: number
  /** 互动 ÷ 阅读 */
  rate: number | null
}

export function rankedPub(pub: Publication): RankedPub {
  const totals = pub.totals ?? { reads: 0, likes: 0, collects: 0, comments: 0 }
  const interactions = totals.likes + totals.collects + totals.comments
  const from = addDays(LATEST_DAY, -6)
  const growth = pubDaily(pub)
    .filter((item) => item.day >= from)
    .reduce((sum, item) => sum + item.reads, 0)
  return {
    pub,
    work: workById(pub.workId),
    account: accountById(pub.accountId),
    reads: totals.reads,
    interactions,
    growth,
    rate: totals.reads > 0 ? interactions / totals.reads : null,
  }
}

export type RankBy = "reads" | "interactions" | "growth"

/** 已发版本按某项排序，取前 limit 个 */
export function topPublications(by: RankBy, limit = 10, accountId?: string): RankedPub[] {
  return PUBLICATIONS.filter((pub) => pub.state === "published" && pub.totals && (!accountId || pub.accountId === accountId))
    .map(rankedPub)
    .sort((a, b) => b[by] - a[by] || b.reads - a.reads || a.pub.id.localeCompare(b.pub.id))
    .slice(0, limit)
}

// ---------- 账号概况 ----------

export interface AccountSummary {
  account: Account
  followers: number
  followers7d: number
  followers30d: number
  reads7d: number
  /** 近 7 天阅读比再往前 7 天 */
  readsChange: number | null
  interactions7d: number
  /** 本周已发的版本数 */
  postsThisWeek: number
  postsTarget: number
  /** 在这个号上发过的作品数 */
  works: number
  lastPublishedAt: DayKey | null
  daysSincePublish: number | null
  /** 近 12 周每周的粉丝增减，最后一个是本周（到昨天） */
  weeklyGain: number[]
  /** 运营中、超过 14 天没发 */
  stale: boolean
  /** 粉丝 ÷ 目标 */
  goalProgress: number
}

function publishedOn(accountId: string): Publication[] {
  return PUBLICATIONS.filter((pub) => pub.accountId === accountId && pub.state === "published" && pub.publishedAt)
}

export function accountSummary(accountId: string): AccountSummary {
  const account = accountById(accountId)
  const followers = followersOn(accountId, LATEST_DAY) ?? 0
  const at = (days: number) => followersOn(accountId, addDays(LATEST_DAY, -days)) ?? 0
  const reads7d = sumFlow(accountId, addDays(LATEST_DAY, -6), LATEST_DAY, "reads")
  const readsPrev = sumFlow(accountId, addDays(LATEST_DAY, -13), addDays(LATEST_DAY, -7), "reads")
  const pubs = publishedOn(accountId)
  const last = pubs.reduce<DayKey | null>((max, pub) => (pub.publishedAt && (!max || pub.publishedAt > max) ? pub.publishedAt : max), null)
  const daysSincePublish = last ? diffDays(TODAY, last) : null
  const weeklyGain = Array.from({ length: 12 }, (_, i) => {
    const week = addDays(THIS_WEEK, -7 * (11 - i))
    const end = minDay(addDays(week, 6), LATEST_DAY)
    const start = followersOn(accountId, addDays(week, -1)) ?? 0
    return (followersOn(accountId, end) ?? 0) - start
  })
  return {
    account,
    followers,
    followers7d: followers - at(7),
    followers30d: followers - at(30),
    reads7d,
    readsChange: readsPrev > 0 ? (reads7d - readsPrev) / readsPrev : null,
    interactions7d: sumFlow(accountId, addDays(LATEST_DAY, -6), LATEST_DAY, "interactions"),
    postsThisWeek: pubs.filter((pub) => pub.publishedAt && pub.publishedAt >= THIS_WEEK && pub.publishedAt <= TODAY).length,
    postsTarget: account.goals.postsPerWeek,
    works: new Set(pubs.map((pub) => pub.workId)).size,
    lastPublishedAt: last,
    daysSincePublish,
    weeklyGain,
    stale: account.stage === "active" && daysSincePublish !== null && daysSincePublish > 14,
    goalProgress: account.goals.followers > 0 ? followers / account.goals.followers : 0,
  }
}

export const ACCOUNT_SUMMARIES: AccountSummary[] = ACCOUNTS.map((account) => accountSummary(account.id))

export function summaryOf(accountId: string): AccountSummary {
  const summary = ACCOUNT_SUMMARIES.find((item) => item.account.id === accountId)
  if (!summary) throw new Error(`没有这个账号：${accountId}`)
  return summary
}

// ---------- 走势 ----------

export type MetricId = "followers" | "reads" | "interactions" | "posts"
export type RangeId = "4w" | "12w"

export interface SeriesPoint {
  key: string
  /** 横轴上的短标签：10/7 */
  label: string
  /** 悬停时的完整说明 */
  title: string
  value: number
  /** 上一期同位置的值 */
  compare: number | null
}

export interface MetricResult {
  metric: MetricId
  /** 页签上的大数字：粉丝取最新值，其余取这段时间的合计 */
  value: number
  /** 粉丝：这段时间的增长率；其余：比上一期 */
  change: number | null
  points: SeriesPoint[]
}

function scopeIds(scope: string): string[] {
  return scope === "all" ? ACCOUNTS.map((account) => account.id) : [scope]
}

function followersSum(ids: string[], day: DayKey): number {
  return ids.reduce((sum, id) => sum + (followersOn(id, day) ?? 0), 0)
}

function flowSum(ids: string[], start: DayKey, end: DayKey, key: FlowKey): number {
  return ids.reduce((sum, id) => sum + sumFlow(id, start, end, key), 0)
}

function rangeStart(range: RangeId): DayKey {
  return range === "4w" ? addDays(LATEST_DAY, -27) : addDays(THIS_WEEK, -77)
}

/** scope 传 "all"（全部账号）或一个账号编号 */
export function metricSeries(scope: string, metric: MetricId, range: RangeId): MetricResult {
  const ids = scopeIds(scope)
  const valueOf = (start: DayKey, end: DayKey) => (metric === "followers" ? followersSum(ids, end) : flowSum(ids, start, end, metric))

  let points: SeriesPoint[]
  if (range === "4w") {
    points = daysBetween(rangeStart("4w"), LATEST_DAY).map((day) => {
      const prev = addDays(day, -28)
      return {
        key: day,
        label: formatDayShort(day),
        title: `${formatDay(day)} ${weekdayLabel(day)}`,
        value: valueOf(day, day),
        compare: valueOf(prev, prev),
      }
    })
  } else {
    points = Array.from({ length: 12 }, (_, i) => {
      const week = addDays(THIS_WEEK, -7 * (11 - i))
      const end = minDay(addDays(week, 6), LATEST_DAY)
      const prevWeek = addDays(week, -84)
      const prevEnd = addDays(prevWeek, diffDays(end, week))
      const current = week === THIS_WEEK
      return {
        key: week,
        label: formatDayShort(week),
        title: current ? `${formatWeekRange(week)}（到${formatDay(end)}）` : formatWeekRange(week),
        value: valueOf(week, end),
        compare: valueOf(prevWeek, prevEnd),
      }
    })
  }

  const start = rangeStart(range)
  let value: number
  let change: number | null
  if (metric === "followers") {
    value = followersSum(ids, LATEST_DAY)
    const base = followersSum(ids, addDays(start, -1))
    change = base > 0 ? (value - base) / base : null
  } else {
    value = flowSum(ids, start, LATEST_DAY, metric)
    const length = diffDays(LATEST_DAY, start) + 1
    const prev = flowSum(ids, addDays(start, -length), addDays(start, -1), metric)
    change = prev > 0 ? (value - prev) / prev : null
  }
  return { metric, value, change, points }
}

// ---------- 栏目表现 ----------

export interface ColumnRow {
  column: Column
  /** 这段时间发了几个版本 */
  pubs: number
  /** 实际占比 */
  share: number
  targetShare: number
  avgReads: number | null
  interactionRate: number | null
  /** 每周发了几个，12 个数 */
  weekly: number[]
}

/** 某账号各栏目近 12 周（到 end 为止）的表现 */
export function columnRows(accountId: string, end: DayKey = LATEST_DAY): ColumnRow[] {
  const account = accountById(accountId)
  const firstWeek = addDays(weekStartOf(end), -77)
  const pubs = publishedOn(accountId).filter((pub) => pub.publishedAt && pub.publishedAt >= firstWeek && pub.publishedAt <= end)
  return account.columns.map((column) => {
    const mine = pubs.filter((pub) => pub.columnId === column.id)
    const reads = mine.reduce((sum, pub) => sum + (pub.totals?.reads ?? 0), 0)
    const interactions = mine.reduce((sum, pub) => sum + (pub.totals ? pub.totals.likes + pub.totals.collects + pub.totals.comments : 0), 0)
    return {
      column,
      pubs: mine.length,
      share: pubs.length > 0 ? mine.length / pubs.length : 0,
      targetShare: column.targetShare,
      avgReads: mine.length > 0 ? Math.round(reads / mine.length) : null,
      interactionRate: reads > 0 ? interactions / reads : null,
      weekly: Array.from({ length: 12 }, (_, i) => {
        const week = addDays(firstWeek, 7 * i)
        const weekEnd = addDays(week, 6)
        return mine.filter((pub) => pub.publishedAt && pub.publishedAt >= week && pub.publishedAt <= weekEnd).length
      }),
    }
  })
}

// ---------- 周报 ----------

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
  /** 这一周阅读最多的版本和它这一周的阅读 */
  best: { item: RankedPub; weekReads: number } | null
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
  /** 这一周发出的版本 */
  published: RankedPub[]
  digest: string[]
  suggestions: string[]
  note: WeeklyNote | null
}

/** 周报能看的周：本周和之前 8 周，新的在前 */
export const REPORT_WEEKS: DayKey[] = Array.from({ length: 9 }, (_, i) => addDays(THIS_WEEK, -7 * i))

function pubReadsBetween(pub: Publication, start: DayKey, end: DayKey): number {
  return pubDaily(pub)
    .filter((item) => item.day >= start && item.day <= end)
    .reduce((sum, item) => sum + item.reads, 0)
}

function weekRows(week: DayKey, end: DayKey): WeekRow[] {
  return ACCOUNTS.filter((account) => account.since <= end).map((account) => {
    const start = followersOn(account.id, addDays(week, -1)) ?? 0
    const finish = followersOn(account.id, end) ?? 0
    const pubs = publishedOn(account.id)
    let best: WeekRow["best"] = null
    for (const pub of pubs) {
      const weekReads = pubReadsBetween(pub, week, end)
      if (weekReads > 0 && (!best || weekReads > best.weekReads)) best = { item: rankedPub(pub), weekReads }
    }
    return {
      account,
      followersStart: start,
      followersEnd: finish,
      delta: finish - start,
      posts: pubs.filter((pub) => pub.publishedAt && pub.publishedAt >= week && pub.publishedAt <= end).length,
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
  const published = PUBLICATIONS.filter(
    (pub) => pub.state === "published" && pub.publishedAt && pub.publishedAt >= week && pub.publishedAt <= end,
  )
    .map(rankedPub)
    .sort((a, b) => (a.pub.publishedAt ?? "").localeCompare(b.pub.publishedAt ?? "") || a.pub.id.localeCompare(b.pub.id))

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
      if (row.target > 0 && row.posts < row.target && row.account.platform !== "wechat") {
        suggestions.push(`${accountLabel(row.account)}发了 ${row.posts} 篇，比目标少 ${row.target - row.posts} 篇。`)
      }
    }
  }
  const zhihuColumns = columnRows("zhihu-yiye", end)
  const bestColumn = [...zhihuColumns].filter((row) => row.avgReads !== null).sort((a, b) => (b.avgReads ?? 0) - (a.avgReads ?? 0))[0]
  if (bestColumn?.avgReads) {
    suggestions.push(`「${bestColumn.column.name}」近 12 周平均每篇阅读 ${formatCount(bestColumn.avgReads)}，是表现最好的栏目。`)
  }
  const empty = zhihuColumns.filter((row) => row.pubs === 0).map((row) => `「${row.column.name}」`)
  if (empty.length > 0) suggestions.push(`${empty.join("")}近 12 周还没发过，离计划占比差得最多。`)
  const wechat = summaryOf("wechat-acg")
  if (wechat.lastPublishedAt) {
    const idle = diffDays(end, wechat.lastPublishedAt)
    if (idle > 14)
      suggestions.push(`${wechat.account.name} ${idle} 天没更新，审核队列里有 ${WECHAT_REVIEW_QUEUE} 张待审，先审图再恢复日更。`)
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
    suggestions,
    note: WEEKLY_NOTES.find((note) => note.week === week) ?? null,
  }
}

// ---------- 本周节奏 ----------

export interface CadenceItem {
  pub: Publication
  work: Work
  account: Account
  /** 已发、已排期、等回填 */
  kind: "published" | "planned" | "pending"
}

export interface CadenceDay {
  day: DayKey
  weekday: string
  date: string
  isToday: boolean
  isPast: boolean
  items: CadenceItem[]
}

export function weekCadence(week: DayKey = THIS_WEEK): CadenceDay[] {
  return daysBetween(week, addDays(week, 6)).map((day) => ({
    day,
    weekday: weekdayLabel(day),
    date: formatDayShort(day),
    isToday: day === TODAY,
    isPast: day < TODAY,
    items: PUBLICATIONS.flatMap((pub): CadenceItem[] => {
      const base = { pub, work: workById(pub.workId), account: accountById(pub.accountId) }
      if (pub.state === "published" && pub.publishedAt === day) return [{ ...base, kind: "published" }]
      if (pub.state === "scheduled" && pub.plannedFor === day) return [{ ...base, kind: "planned" }]
      if (pub.state === "pending-link" && pub.plannedFor === day) return [{ ...base, kind: "pending" }]
      return []
    }),
  }))
}

// ---------- 待处理 ----------

export type InboxKind = "failed" | "data" | "stale" | "run" | "planned" | "manual"
export type InboxTone = "risk" | "progress" | "idle"

export interface InboxItem {
  id: string
  kind: InboxKind
  tone: InboxTone
  title: string
  detail: string
  /** 按钮文字 */
  action: string
  href: string
  /** 站外链接（审核页）用新窗口打开 */
  external: boolean
  at: IsoTime
}

const KIND_ORDER: InboxKind[] = ["failed", "data", "stale", "run", "planned", "manual"]
const TONE_ORDER: InboxTone[] = ["risk", "progress", "idle"]

export function toolName(toolId: string): string {
  return TOOLS.find((tool) => tool.id === toolId)?.name ?? toolId
}

function lastStepAt(run: ToolRun): IsoTime {
  return run.steps.reduce((max, step) => (step.at && step.at > max ? step.at : max), run.startedAt)
}

export function inboxItems(): InboxItem[] {
  const items: InboxItem[] = []
  for (const run of RUNS) {
    if (run.state === "waiting") {
      const external = run.toolId === "wechat-review"
      items.push({
        id: `run:${run.id}`,
        kind: "run",
        tone: "progress",
        title: run.waitingFor ?? "等你处理",
        detail: `${toolName(run.toolId)} · ${run.title}`,
        action: run.actionLabel ?? "去处理",
        href: external ? WECHAT_REVIEW_URL : `/tools/?run=${run.id}`,
        external,
        at: lastStepAt(run),
      })
    }
    if (run.state === "failed" && run.toolId !== "data-pull") {
      items.push({
        id: `failed:${run.id}`,
        kind: "failed",
        tone: "risk",
        title: `${toolName(run.toolId)}没跑完`,
        detail: run.error ?? run.title,
        action: "看原因",
        href: `/tools/?run=${run.id}`,
        external: false,
        at: run.finishedAt ?? run.startedAt,
      })
    }
  }
  for (const account of ACCOUNTS) {
    const source = account.dataSource
    if (source.lastResult === "failed") {
      items.push({
        id: `data:${account.id}`,
        kind: "data",
        tone: "risk",
        title: `${account.name}数据拉取失败`,
        detail: source.failReason ?? source.provider,
        action: "去修复",
        href: "/data/#sources",
        external: false,
        at: source.lastPullAt ?? `${TODAY}T06:00:00+08:00`,
      })
    }
    const summary = summaryOf(account.id)
    if (summary.stale && summary.daysSincePublish !== null) {
      items.push({
        id: `stale:${account.id}`,
        kind: "stale",
        tone: "risk",
        title: `${account.name} ${summary.daysSincePublish} 天没更新`,
        detail:
          account.id === "wechat-acg"
            ? `审核队列 ${WECHAT_REVIEW_QUEUE} 张待审`
            : `上次发布在${formatDay(summary.lastPublishedAt ?? TODAY)}`,
        action: "看账号",
        href: `/accounts/${account.id}/`,
        external: false,
        at: `${account.id === "wechat-acg" ? WECHAT_LAST_ISSUE : (summary.lastPublishedAt ?? TODAY)}T20:34:00+08:00`,
      })
    }
    if (source.mode === "manual" && source.lastPullAt) {
      const days = diffDays(TODAY, source.lastPullAt.slice(0, 10))
      if (days > 7) {
        items.push({
          id: `manual:${account.id}`,
          kind: "manual",
          tone: "idle",
          title: `${accountLabel(account)}数据 ${days} 天没填`,
          detail: source.schedule,
          action: "去手填",
          href: `/data/?entry=${account.id}`,
          external: false,
          at: source.lastPullAt,
        })
      }
    }
  }
  for (const pub of PUBLICATIONS) {
    if (pub.state !== "scheduled" || !pub.plannedFor) continue
    const ahead = diffDays(pub.plannedFor, TODAY)
    if (ahead < 0 || ahead > 3) continue
    items.push({
      id: `planned:${pub.id}`,
      kind: "planned",
      tone: "progress",
      title: `${formatDayRelative(pub.plannedFor)}发：${shortTitle(workById(pub.workId).title)}`,
      detail: `${platformName(pub.accountId)} · 已排期`,
      action: "看作品",
      href: `/works/?open=${pub.workId}`,
      external: false,
      at: `${pub.plannedFor}T09:00:00+08:00`,
    })
  }
  return items.sort(
    (a, b) =>
      TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      // 排期的按日子从近到远，其余按时间从新到旧
      (a.kind === "planned" ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)),
  )
}

export const INBOX: InboxItem[] = inboxItems()

// ---------- 作品 ----------

export interface WorkRow {
  work: Work
  account: Account
  pubs: Publication[]
  /** 各平台阅读之和 */
  reads: number
  interactions: number
  /** 近 7 天新增阅读 */
  growth: number
  firstPublishedAt: DayKey | null
}

export function workRow(work: Work): WorkRow {
  const pubs = PUBLICATIONS.filter((pub) => pub.workId === work.id)
  const ranked = pubs.filter((pub) => pub.state === "published").map(rankedPub)
  const first = pubs.reduce<DayKey | null>((min, pub) => (pub.publishedAt && (!min || pub.publishedAt < min) ? pub.publishedAt : min), null)
  return {
    work,
    account: accountById(work.accountId),
    pubs,
    reads: ranked.reduce((sum, item) => sum + item.reads, 0),
    interactions: ranked.reduce((sum, item) => sum + item.interactions, 0),
    growth: ranked.reduce((sum, item) => sum + item.growth, 0),
    firstPublishedAt: first,
  }
}

/** 全部作品，最近更新的在前 */
export const WORK_ROWS: WorkRow[] = WORKS.map(workRow).sort(
  (a, b) => b.work.updatedAt.localeCompare(a.work.updatedAt) || a.work.title.localeCompare(b.work.title, "zh-CN"),
)

// ---------- 工具 ----------

export interface ToolStats {
  /** 本月运行次数 */
  runsThisMonth: number
  lastRun: ToolRun | null
}

export function toolStats(toolId: string): ToolStats {
  const runs = RUNS.filter((run) => run.toolId === toolId)
  return {
    runsThisMonth: runs.filter((run) => run.startedAt.startsWith(TODAY.slice(0, 7))).length,
    lastRun: runs[0] ?? null,
  }
}
