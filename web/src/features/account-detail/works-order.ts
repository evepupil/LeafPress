import { sortColumn, type Work } from "@leafpress/core"

export const ACCOUNT_WORK_PREVIEW_LIMIT = 8

/** 账号页的作品顺序复用看板规则，仅调整状态分组顺序。 */
export function orderAccountWorks(works: Work[], accountId: string): Work[] {
  const accountWorks = works.filter((work) => work.accountId === accountId)
  return (["waiting", "doing", "todo", "done"] as const).flatMap((status) => sortColumn(accountWorks, status))
}

export function previewAccountWorks(works: Work[], accountId: string): { total: number; items: Work[] } {
  const ordered = orderAccountWorks(works, accountId)
  return { total: ordered.length, items: ordered.slice(0, ACCOUNT_WORK_PREVIEW_LIMIT) }
}
