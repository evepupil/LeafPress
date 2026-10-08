import type { BarDatum } from "@/components/base/bars"
import { ACCOUNTS, accountById } from "@/data/accounts"
import { LATEST_DAY, TODAY, addDays, daysBetween } from "@/data/clock"
import { pubDaily } from "@/data/series"
import type { DayKey, PlatformId, PubState, Publication, Work, WorkStatus } from "@/data/types"
import { formatCount, formatDay, formatDayShort } from "@/lib/format"
import { WORK_ROWS, type WorkRow } from "@/lib/metrics"

/**
 * 作品工作区的纯逻辑：筛选、排序、「回填链接」覆盖、近 14 天阅读、地址栏参数。
 * 不含界面，看板、列表、抽屉共用同一份结果。
 */

export type ViewMode = "board" | "list"
export type SortKey = "first" | "reads" | "growth"
export type SortDir = "desc" | "asc"

export interface SortState {
  key: SortKey
  dir: SortDir
}

/** 回填链接后某个版本的覆盖：按已发显示，并带上登记的链接 */
export interface PubOverride {
  state: "published"
  url: string
}

export type PubOverrides = Record<string, PubOverride>

export interface WorksFilters {
  query: string
  /** "all" 或账号编号 */
  account: string
  platform: "all" | PlatformId
  status: "all" | WorkStatus
  pendingOnly: boolean
}

export const NO_FILTERS: WorksFilters = { query: "", account: "all", platform: "all", status: "all", pendingOnly: false }

/** 看板「已发」列默认只显示前这么多张 */
export const BOARD_PUBLISHED_LIMIT = 12

/** 新建作品弹窗交出来的内容 */
export interface NewWorkInput {
  title: string
  accountId: string
  columnId: string
}

// ---------- 地址栏参数 ----------

export interface InitialWorksState {
  openId: string | null
  filters: WorksFilters
}

/** `open=<作品编号>` 打开抽屉、`view=pending` 只看待发、`account=<账号编号>` 选账号；指向不存在的内容就忽略 */
export function readWorksParams(params: Pick<URLSearchParams, "get">): InitialWorksState {
  const open = params.get("open")
  const account = params.get("account")
  return {
    openId: open !== null && WORK_ROWS.some((row) => row.work.id === open) ? open : null,
    filters: {
      ...NO_FILTERS,
      account: account !== null && ACCOUNTS.some((item) => item.id === account) ? account : NO_FILTERS.account,
      pendingOnly: params.get("view") === "pending",
    },
  }
}

// ---------- 回填链接的覆盖 ----------

/** 一个版本套上覆盖：状态改已发，发布日期记今天，没有累计数据（数据四格显示「—」） */
export function applyOverride(pub: Publication, overrides: PubOverrides): Publication {
  const override = overrides[pub.id]
  if (!override) return pub
  return { ...pub, state: override.state, url: override.url, publishedAt: TODAY }
}

/** 一个作品套上覆盖，并重算首发日期；没有相关覆盖时原样返回 */
export function withOverrides(row: WorkRow, overrides: PubOverrides): WorkRow {
  if (!row.pubs.some((pub) => overrides[pub.id])) return row
  const pubs = row.pubs.map((pub) => applyOverride(pub, overrides))
  const firstPublishedAt = pubs.reduce<DayKey | null>(
    (min, pub) => (pub.publishedAt && (!min || pub.publishedAt < min) ? pub.publishedAt : min),
    null,
  )
  return { ...row, pubs, firstPublishedAt }
}

// ---------- 筛选 ----------

/** 待发：作品状态是待发，或有版本已排期 / 等回填（版本状态已含覆盖） */
export function isPending(row: WorkRow): boolean {
  return row.work.status === "ready" || row.pubs.some((pub) => pub.state === "scheduled" || pub.state === "pending-link")
}

export function matchesFilters(row: WorkRow, filters: WorksFilters): boolean {
  const query = filters.query.trim().toLowerCase()
  if (query && !row.work.title.toLowerCase().includes(query)) return false
  // 账号：主账号是它，或有任何一个版本发在它上面
  if (filters.account !== "all" && row.work.accountId !== filters.account && !row.pubs.some((pub) => pub.accountId === filters.account)) {
    return false
  }
  if (filters.platform !== "all" && !row.pubs.some((pub) => accountById(pub.accountId).platform === filters.platform)) return false
  if (filters.status !== "all" && row.work.status !== filters.status) return false
  if (filters.pendingOnly && !isPending(row)) return false
  return true
}

export function hasActiveFilters(filters: WorksFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.account !== "all" ||
    filters.platform !== "all" ||
    filters.status !== "all" ||
    filters.pendingOnly
  )
}

// ---------- 排序 ----------

/** 点一次按这一列倒序，再点改正序，第三次取消（回到最近更新顺序） */
export function nextSort(sort: SortState | null, key: SortKey): SortState | null {
  if (!sort || sort.key !== key) return { key, dir: "desc" }
  if (sort.dir === "desc") return { key, dir: "asc" }
  return null
}

export function sortRows(rows: WorkRow[], sort: SortState | null): WorkRow[] {
  if (!sort) return rows
  const direction = sort.dir === "desc" ? -1 : 1
  return [...rows].sort((a, b) => {
    if (sort.key === "first") {
      const x = a.firstPublishedAt
      const y = b.firstPublishedAt
      if (x === y) return 0
      // 没有首发日期的永远排最后，正倒序都一样
      if (x === null) return 1
      if (y === null) return -1
      return x < y ? -direction : direction
    }
    const x = sort.key === "reads" ? a.reads : a.growth
    const y = sort.key === "reads" ? b.reads : b.growth
    return (x - y) * direction
  })
}

// ---------- 版本 ----------

const PUB_STATE_ORDER: Record<PubState, number> = { published: 0, "pending-link": 1, scheduled: 2, draft: 3 }

/** 已发的在前，其余按等回填、已排期、草稿；同一状态保持原顺序 */
export function orderPubs(pubs: Publication[]): Publication[] {
  return [...pubs].sort((a, b) => PUB_STATE_ORDER[a.state] - PUB_STATE_ORDER[b.state])
}

// ---------- 抽屉里的数据 ----------

/** 作品所有已发版本，每天的阅读相加，取最新一天往前 14 天（含） */
export function recentReads(pubs: Publication[]): { data: BarDatum[]; total: number } {
  const days = daysBetween(addDays(LATEST_DAY, -13), LATEST_DAY)
  const byDay = new Map<DayKey, number>()
  for (const pub of pubs) {
    if (pub.state !== "published") continue
    for (const item of pubDaily(pub)) byDay.set(item.day, (byDay.get(item.day) ?? 0) + item.reads)
  }
  const data = days.map((day): BarDatum => {
    const reads = byDay.get(day) ?? 0
    return { key: day, label: formatDayShort(day), title: `${formatDay(day)} · ${formatCount(reads)}`, value: reads }
  })
  return { data, total: data.reduce((sum, item) => sum + item.value, 0) }
}

export const ORIGIN_LABEL: Record<Work["origin"], string> = {
  notion: "Notion 同步",
  repo: "博客仓库",
  "zhihu-writing": "知乎写作",
  pipeline: "自动流程",
  idea: "灵感",
}

/** 「3,645 字 · 2 张图 · 5 段代码」：缺哪项省哪项，全缺显示「—」 */
export function lengthText(work: Work): string {
  const parts: string[] = []
  if (work.words !== undefined) parts.push(`${formatCount(work.words)} 字`)
  if (work.images !== undefined) parts.push(`${work.images} 张图`)
  if (work.codeBlocks !== undefined) parts.push(`${work.codeBlocks} 段代码`)
  return parts.length > 0 ? parts.join(" · ") : "—"
}
