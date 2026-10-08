import { PLATFORMS } from "../catalog/index.ts"
import type { PlatformId, Work, WorkStatus } from "../types/index.ts"

/** 一列中的作品顺序。待实现按队列，已完成按发布日期，其余按最近更新。 */
export function sortColumn(works: Work[], status: WorkStatus): Work[] {
  const column = works.filter((work) => work.status === status)
  if (status === "todo") return column.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
  if (status === "done") {
    return column.sort(
      (a, b) =>
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    )
  }
  return column.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}

export interface WorkFilter {
  platform: PlatformId | "all"
  query: string
}

export const EMPTY_FILTER: WorkFilter = { platform: "all", query: "" }

/** 按平台和标题、要求、编号筛选，不区分关键字大小写。 */
export function filterWorks(works: Work[], filter: WorkFilter, platformOf: (accountId: string) => PlatformId | undefined): Work[] {
  const query = filter.query.trim().toLowerCase()
  return works.filter((work) => {
    if (filter.platform !== "all" && platformOf(work.accountId) !== filter.platform) return false
    if (!query) return true
    return work.title.toLowerCase().includes(query) || work.brief.toLowerCase().includes(query) || work.id.toLowerCase().includes(query)
  })
}

export function countBy(works: Work[], status: WorkStatus): number {
  return works.filter((work) => work.status === status).length
}

/** 重排待实现列，返回从 1 开始的完整 order 映射。 */
export function reorderTodo(works: Work[], id: string, beforeId: string | null): Map<string, number> {
  const column = sortColumn(works, "todo").filter((work) => work.id !== id)
  const index = beforeId === null ? -1 : column.findIndex((work) => work.id === beforeId)
  const moving = works.find((work) => work.id === id)
  if (moving) column.splice(index === -1 ? column.length : index, 0, moving)
  return new Map(column.map((work, i) => [work.id, i + 1]))
}

export function topOrder(works: Work[]): number {
  return works.filter((work) => work.status === "todo").reduce((min, work) => Math.min(min, work.order), 1) - 1
}

export function bottomOrder(works: Work[]): number {
  return works.filter((work) => work.status === "todo").reduce((max, work) => Math.max(max, work.order), 0) + 1
}

/** 待实现列中按排序顺序挑第一个允许开始的作品。 */
export function pickNext(works: Work[], canStart: (work: Work) => boolean): Work | undefined {
  return sortColumn(works, "todo").find(canStart)
}

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

export function derivedFrom(works: Work[], workId: string): Work[] {
  return works.filter((work) => work.source.kind === "work" && work.source.workId === workId)
}

export function newWorkId(platform: PlatformId, serial: number): string {
  return `${PLATFORMS[platform].idPrefix}-${serial}`
}
