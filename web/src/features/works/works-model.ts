import { PLATFORMS, accountById } from "@/data/accounts"
import { WORK_STATUS_ORDER } from "@/data/labels"
import type { PlatformId, Work, WorkStatus } from "@/data/types"
import { filterWorks, sortColumn } from "@/lib/board"
import { formatDayShort, formatRelative } from "@/lib/format"

/**
 * 作品页的纯函数：地址栏参数怎么读、怎么写，看板每列放什么，卡片上的小字写什么。
 * 不碰 React 和状态，单测见 works-model.test.ts。
 */

export type WorksView = "board" | "list"
export type PlatformFilter = PlatformId | "all"

/** 平台从左到右的顺序，和筛选栏一致 */
export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[]

/** 已完成一列每次多显示几个 */
export const DONE_PAGE_SIZE = 20

/** 卡片、菜单、列表行要往页面上报的动作：打开详情、转作品、删除 */
export interface WorkHandlers {
  onOpen(id: string): void
  onConvert(work: Work): void
  onDelete(work: Work): void
}

// ---------- 地址栏参数 ----------

export interface WorksParams {
  view: WorksView
  platform: PlatformFilter
  status: WorkStatus | null
  /** 打开的作品编号，没有就是 null */
  openId: string | null
}

/** 读地址栏：不认识的值一律当作没写 */
export function readWorksParams(params: { get(name: string): string | null }): WorksParams {
  const platform = params.get("platform")
  const status = params.get("status")
  return {
    view: params.get("view") === "list" ? "list" : "board",
    platform: PLATFORM_IDS.find((id) => id === platform) ?? "all",
    status: WORK_STATUS_ORDER.find((item) => item === status) ?? null,
    openId: params.get("open") || null,
  }
}

/** 默认值不写进地址栏 */
const DEFAULT_PARAM: Readonly<Record<string, string>> = { view: "board", platform: "all" }

/** 在当前参数上改一项（value 为 null 或等于默认值就删掉），返回新的参数串，不带问号 */
export function withParam(search: string, name: string, value: string | null): string {
  const params = new URLSearchParams(search)
  if (value === null || value === DEFAULT_PARAM[name]) params.delete(name)
  else params.set(name, value)
  return params.toString()
}

/** 参数串对应的地址：没有参数就是 / */
export function worksHref(search: string): string {
  return search ? `/?${search}` : "/"
}

// ---------- 筛选与分列 ----------

/** 筛选栏每个平台后面的数字：按搜索词筛过、不按平台筛 */
export function platformCounts(works: Work[], query: string): Record<PlatformFilter, number> {
  const matched = filterWorks(works, { platform: "all", query })
  const counts: Record<PlatformFilter, number> = { all: matched.length, blog: 0, zhihu: 0, bilibili: 0, xiaohongshu: 0 }
  for (const work of matched) counts[accountById(work.accountId).platform] += 1
  return counts
}

export interface WorkColumnData {
  status: WorkStatus
  items: Work[]
}

/** 看板的列和列表的组：按状态顺序，每个里面按先后排好；only 不为空时只留那一个 */
export function workColumns(works: Work[], only: WorkStatus | null): WorkColumnData[] {
  return WORK_STATUS_ORDER.filter((status) => only === null || status === only).map((status) => ({
    status,
    items: sortColumn(works, status),
  }))
}

export interface TodoQueue {
  /** 作品编号 → 排队位置，从 1 开始 */
  positions: ReadonlyMap<string, number>
  /** 排第一的作品编号，没有待实现的作品就是 null */
  frontId: string | null
}

/** 待实现的排队情况。排队是全局的（AI 从头往后挑），不跟着平台和搜索词的筛选变 */
export function todoQueue(works: Work[]): TodoQueue {
  const queue = sortColumn(works, "todo")
  return { positions: new Map(queue.map((work, index) => [work.id, index + 1])), frontId: queue[0]?.id ?? null }
}

/** 空列的一句话 */
export function emptyColumnText(status: WorkStatus): string {
  return status === "waiting" ? "没有等你处理的作品" : "这一列是空的"
}

/** 「再显示 N 个」里的 N：每次最多 20 个，不够 20 个就是剩下的 */
export function moreCount(total: number, shown: number): number {
  return Math.max(0, Math.min(DONE_PAGE_SIZE, total - shown))
}

// ---------- 卡片上的字 ----------

/** 卡片右上角的小字：待实现是排队位置，进行中和等你处理是最近变动，已完成是发布日期 */
export function cardTimeText(work: Work, queuePos: number | undefined): string | null {
  switch (work.status) {
    case "todo":
      return queuePos === undefined ? null : `#${queuePos}`
    case "doing":
    case "waiting":
      return formatRelative(work.updatedAt)
    case "done":
      return work.publishedAt ? formatDayShort(work.publishedAt) : null
  }
}

/** 来源标记（前面的「· 」由卡片补）：由别的作品转来的写「由博客转」，灵感转来的写「来自灵感」 */
export function sourceMarkOf(work: Work, sourceWork: Work | undefined): string | null {
  if (work.source.kind === "idea") return "来自灵感"
  if (work.source.kind === "work" && sourceWork) return `由${PLATFORMS[accountById(sourceWork.accountId).platform].name}转`
  return null
}

export interface CardMetric {
  label: string
  value: number
}

/**
 * 已完成卡片第三行的两项数据，按各平台自己的叫法：主数据（浏览 / 访问 / 播放）+ 第一项互动
 * （知乎、B站、小红书是点赞，博客是评论）。没有数据返回空数组。
 */
export function cardMetrics(work: Work): CardMetric[] {
  const totals = work.totals
  if (!totals) return []
  const metrics = PLATFORMS[accountById(work.accountId).platform].metrics
  const picked = [metrics[0], metrics.find((item) => item.interaction)].filter((item) => item !== undefined)
  return picked.map((item) => ({ label: item.label, value: totals[item.key] ?? 0 }))
}
