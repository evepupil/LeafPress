import type { Work } from "@/data/types"

/** 一个账号手上还没做完的活：三种状态各有几个 */
export interface TaskCounts {
  /** 待实现：AI 的待做 */
  todo: number
  /** 进行中：AI 正在做 */
  doing: number
  /** 等你处理：要你动手 */
  waiting: number
}

/** 数一个账号的作品：待实现、进行中、等你处理各几个。已完成的不算「手上的活」 */
export function taskCounts(works: Work[], accountId: string): TaskCounts {
  const counts: TaskCounts = { todo: 0, doing: 0, waiting: 0 }
  for (const work of works) {
    if (work.accountId !== accountId || work.status === "done") continue
    counts[work.status] += 1
  }
  return counts
}

/** 三种都是 0，手上就没有活 */
export function isIdle(counts: TaskCounts): boolean {
  return counts.todo + counts.doing + counts.waiting === 0
}
