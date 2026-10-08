import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import { TODAY, diffDays } from "@/data/clock"
import type { Idea, IdeaStatus, IsoTime, PlatformId, Work, WorkStatus } from "@/data/types"
import { formatDay } from "./format"
import { accountLabel, summaryOf } from "./metrics"

/**
 * 看板、列表、侧栏计数、提醒要的计算。和 metrics.ts 的区别：这里读的是页面上正在改的作品和灵感（传进来），
 * 不读数据快照。全是纯函数。
 */

// ---------- 作品看板 ----------

/** 一列里的先后：待实现按排队顺序（AI 从上往下挑）；进行中、等你处理按最近变动；已完成按发布日期，新的在前 */
export function sortColumn(works: Work[], status: WorkStatus): Work[] {
  const mine = works.filter((work) => work.status === status)
  switch (status) {
    case "todo":
      return mine.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    case "done":
      return mine.sort(
        (a, b) =>
          (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      )
    default:
      return mine.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  }
}

export interface WorkFilter {
  platform: PlatformId | "all"
  query: string
}

export const EMPTY_FILTER: WorkFilter = { platform: "all", query: "" }

/** 按平台和关键字筛：关键字匹配标题、要求、编号 */
export function filterWorks(works: Work[], filter: WorkFilter): Work[] {
  const query = filter.query.trim().toLowerCase()
  return works.filter((work) => {
    if (filter.platform !== "all" && accountById(work.accountId).platform !== filter.platform) return false
    if (!query) return true
    return work.title.toLowerCase().includes(query) || work.brief.toLowerCase().includes(query) || work.id.toLowerCase().includes(query)
  })
}

export function countBy(works: Work[], status: WorkStatus): number {
  return works.filter((work) => work.status === status).length
}

/** 把 id 挪到 beforeId 前面（beforeId 为空就放到最后），重排待实现的先后。返回新的 order 表 */
export function reorderTodo(works: Work[], id: string, beforeId: string | null): Map<string, number> {
  const queue = sortColumn(works, "todo").filter((work) => work.id !== id)
  const index = beforeId ? queue.findIndex((work) => work.id === beforeId) : -1
  const moving = works.find((work) => work.id === id)
  if (moving) queue.splice(index === -1 ? queue.length : index, 0, moving)
  return new Map(queue.map((work, i) => [work.id, i + 1]))
}

/** 某个工作流正在用（待实现、进行中、等你处理）和已经用完的作品数 */
export function workflowUsage(works: Work[], workflowId: string): { active: number; done: number } {
  let active = 0
  let done = 0
  for (const work of works) {
    if (work.workflowId !== workflowId) continue
    if (work.status === "done") done += 1
    else active += 1
  }
  return { active, done }
}

/** 由这个作品转出去的作品 */
export function derivedFrom(works: Work[], workId: string): Work[] {
  return works.filter((work) => work.source.kind === "work" && work.source.workId === workId)
}

/** 新作品的编号：平台字母 + 序号，例如 z-101 */
const PREFIX: Record<PlatformId, string> = { blog: "b", zhihu: "z", bilibili: "v", xiaohongshu: "x" }

export function newWorkId(platform: PlatformId, serial: number): string {
  return `${PREFIX[platform]}-${serial}`
}

// ---------- 灵感看板 ----------

export function sortIdeas(ideas: Idea[], status: IdeaStatus): Idea[] {
  return ideas.filter((idea) => idea.status === status).sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt))
}

/** 把灵感挪到某列的 beforeId 前面（为空放最后）。返回这一列新的 order 表 */
export function reorderIdeas(ideas: Idea[], id: string, status: IdeaStatus, beforeId: string | null): Map<string, number> {
  const column = sortIdeas(ideas, status).filter((idea) => idea.id !== id)
  const index = beforeId ? column.findIndex((idea) => idea.id === beforeId) : -1
  const moving = ideas.find((idea) => idea.id === id)
  if (moving) column.splice(index === -1 ? column.length : index, 0, moving)
  return new Map(column.map((idea, i) => [idea.id, i + 1]))
}

// ---------- 提醒 ----------

export type NoticeKind = "waiting" | "data" | "stale" | "manual"
export type NoticeTone = "risk" | "progress" | "idle"

export interface Notice {
  id: string
  kind: NoticeKind
  tone: NoticeTone
  title: string
  detail: string
  href: string
  at: IsoTime
}

const KIND_ORDER: NoticeKind[] = ["data", "stale", "waiting", "manual"]

/** 铃铛里的提醒：数据拉取失败、断更、等你处理的作品、该手填的数据 */
export function notices(works: Work[]): Notice[] {
  const items: Notice[] = []
  for (const account of ACCOUNTS) {
    const source = account.dataSource
    if (source.lastResult === "failed") {
      items.push({
        id: `data:${account.id}`,
        kind: "data",
        tone: "risk",
        title: `${account.name}数据拉取失败`,
        detail: source.failReason ?? source.provider,
        href: "/data/#sources",
        at: source.lastPullAt ?? `${TODAY}T06:00:00+08:00`,
      })
    }
    const summary = summaryOf(account.id)
    if (summary.stale && summary.daysSincePublish !== null && summary.lastPublishedAt) {
      items.push({
        id: `stale:${account.id}`,
        kind: "stale",
        tone: "risk",
        title: `${account.name} ${summary.daysSincePublish} 天没更新`,
        detail: `上次发布在${formatDay(summary.lastPublishedAt)}`,
        href: `/accounts/${account.id}/`,
        at: `${summary.lastPublishedAt}T21:30:00+08:00`,
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
          href: `/data/?entry=${account.id}`,
          at: source.lastPullAt,
        })
      }
    }
  }
  for (const work of works) {
    if (work.status !== "waiting") continue
    items.push({
      id: `waiting:${work.id}`,
      kind: "waiting",
      tone: "progress",
      title: work.title,
      detail: `${PLATFORMS[accountById(work.accountId).platform].name} · 等你处理`,
      href: `/?open=${work.id}`,
      at: work.updatedAt,
    })
  }
  return items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.at.localeCompare(a.at))
}
