import {
  PLATFORMS,
  PLATFORM_ORDER,
  WORK_STATUS_ORDER,
  filterWorks as filterByCore,
  sortColumn,
  formatDayShort,
  formatRelative,
  reorderTodo,
  type Account,
  type IsoTime,
  type PlatformId,
  type Work,
  type WorkStatus,
} from "@leafpress/core"

export type WorksView = "board" | "list"
export type PlatformFilter = PlatformId | "all"
export const PLATFORM_IDS: PlatformId[] = [...PLATFORM_ORDER]
export const DONE_PAGE_SIZE = 20

export interface WorkHandlers {
  onOpen(id: string): void
  onConvert(work: Work): void
  onDelete(work: Work): void
}
export interface WorksParams {
  view: WorksView
  platform: PlatformFilter
  status: WorkStatus | null
  openId: string | null
  accountId: string | null
}

export function readWorksParams(params: { get(name: string): string | null }): WorksParams {
  const platform = params.get("platform")
  const status = params.get("status")
  return {
    view: params.get("view") === "list" ? "list" : "board",
    platform: PLATFORM_IDS.find((id) => id === platform) ?? "all",
    status: WORK_STATUS_ORDER.find((item) => item === status) ?? null,
    openId: params.get("open") || null,
    accountId: params.get("account") || null,
  }
}

const DEFAULT_PARAM: Readonly<Record<string, string>> = { view: "board", platform: "all" }
export function withParam(search: string, name: string, value: string | null): string {
  const params = new URLSearchParams(search)
  if (value === null || value === DEFAULT_PARAM[name]) params.delete(name)
  else params.set(name, value)
  return params.toString()
}
export function worksHref(search: string): string {
  return search ? `/?${search}` : "/"
}

export interface WorkColumnData {
  status: WorkStatus
  items: Work[]
}
export interface TodoQueue {
  positions: ReadonlyMap<string, number>
  frontId: string | null
}
export interface CardMetric {
  label: string
  value: number
}

function platformOf(accounts: Account[], id: string): PlatformId | undefined {
  return accounts.find((account) => account.id === id)?.platform
}

export function filterWorks(
  works: Work[],
  filter: { platform: PlatformFilter; query: string; accountId?: string | null },
  accounts: Account[],
): Work[] {
  const byPlatform = filterByCore(works, filter, (id) => platformOf(accounts, id))
  return filter.accountId ? byPlatform.filter((work) => work.accountId === filter.accountId) : byPlatform
}
export function platformCounts(
  works: Work[],
  query: string,
  accounts: Account[],
  accountId?: string | null,
): Record<PlatformFilter, number> {
  const matched = filterWorks(works, { platform: "all", query, accountId }, accounts)
  const counts: Record<PlatformFilter, number> = { all: matched.length, blog: 0, zhihu: 0, bilibili: 0, xiaohongshu: 0 }
  for (const work of matched) {
    const platform = platformOf(accounts, work.accountId)
    if (platform) counts[platform] += 1
  }
  return counts
}
export function moveWorkPreview(works: Work[], id: string, status: WorkStatus, beforeId: string | null, now: IsoTime): Work[] {
  const current = works.find((work) => work.id === id)
  if (!current) return works
  const moved = { ...current, status, updatedAt: now }
  const next = works.map((work) => (work.id === id ? moved : work))
  if (status !== "todo") return next
  const order = reorderTodo(next, id, beforeId)
  return next.map((work) => {
    const position = order.get(work.id)
    return position === undefined ? work : { ...work, order: position }
  })
}

export function workColumns(works: Work[], only: WorkStatus | null): WorkColumnData[] {
  return WORK_STATUS_ORDER.filter((status) => only === null || status === only).map((status) => ({
    status,
    items: sortColumn(works, status),
  }))
}
export function todoQueue(works: Work[]): TodoQueue {
  const queue = sortColumn(works, "todo")
  return { positions: new Map(queue.map((work, index) => [work.id, index + 1])), frontId: queue[0]?.id ?? null }
}
export function emptyColumnText(status: WorkStatus): string {
  return status === "waiting" ? "没有等你处理的作品" : "这一列是空的"
}
export function moreCount(total: number, shown: number): number {
  return Math.max(0, Math.min(DONE_PAGE_SIZE, total - shown))
}
export function cardTimeText(work: Work, queuePos: number | undefined, now: string): string | null {
  switch (work.status) {
    case "todo":
      return queuePos === undefined ? null : `#${queuePos}`
    case "doing":
    case "waiting":
      return formatRelative(work.updatedAt, now)
    case "done":
      return work.publishedAt ? formatDayShort(work.publishedAt) : null
  }
}
export function sourceMarkOf(work: Work, sourceWork: Work | undefined, accounts: Account[]): string | null {
  if (work.source.kind === "idea") return "来自灵感"
  if (work.source.kind === "work" && sourceWork) {
    const platform = platformOf(accounts, sourceWork.accountId)
    return platform ? `由${PLATFORMS[platform].name}转` : null
  }
  return null
}
export function cardMetrics(work: Work, platform: PlatformId): CardMetric[] {
  if (!work.totals) return []
  const metrics = PLATFORMS[platform].metrics
  return [metrics[0], metrics.find((item) => item.interaction)]
    .filter((item) => item !== undefined)
    .map((item) => ({ label: item.label, value: work.totals?.[item.key] ?? 0 }))
}
