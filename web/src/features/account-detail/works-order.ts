import { sortColumn, type Work } from "@leafpress/core"

/** 账号页的作品顺序复用看板规则，仅调整状态分组顺序。 */
export function orderAccountWorks(works: Work[], accountId: string): Work[] {
  const accountWorks = works.filter((work) => work.accountId === accountId)
  return (["waiting", "doing", "todo", "done"] as const).flatMap((status) => sortColumn(accountWorks, status))
}
