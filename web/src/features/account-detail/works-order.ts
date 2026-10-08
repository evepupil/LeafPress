import type { Work, WorkStatus } from "@/data/types"

/** 账号页作品列表的分组顺序：先看要你动手的，再看 AI 在做的，然后是排队的，最后是已发的 */
const STATUS_RANK: Record<WorkStatus, number> = {
  waiting: 0,
  doing: 1,
  todo: 2,
  done: 3,
}

/** 按字符顺序比较，不看语言环境，每台机器排出来都一样 */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 最近变动的在前；时间相同时编号大的在前 */
function recentFirst(a: Work, b: Work): number {
  return compareText(b.updatedAt, a.updatedAt) || compareText(b.id, a.id)
}

/** 排队顺序：order 小的在前（AI 按这个顺序挑），一样时先创建的在前 */
function queueOrder(a: Work, b: Work): number {
  return a.order - b.order || compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id)
}

/** 发布日新的在前；同一天编号大的在前 */
function publishedFirst(a: Work, b: Work): number {
  return compareText(b.publishedAt ?? "", a.publishedAt ?? "") || compareText(b.id, a.id)
}

/** 同一个状态里怎么排 */
const WITHIN_STATUS: Record<WorkStatus, (a: Work, b: Work) => number> = {
  waiting: recentFirst,
  doing: recentFirst,
  todo: queueOrder,
  done: publishedFirst,
}

/**
 * 一个账号上的全部作品，账号页的作品列表按这个顺序排：
 * 等你处理（最近变动的在前）→ 进行中（同上）→ 待实现（排队靠前的在前）→ 已完成（发布日新的在前）。
 * 不改传进来的数组，每次排出来的结果都一样。
 */
export function orderAccountWorks(works: Work[], accountId: string): Work[] {
  return works
    .filter((work) => work.accountId === accountId)
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || WITHIN_STATUS[a.status](a, b))
}
