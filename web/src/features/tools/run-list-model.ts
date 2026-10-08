import { RUN_STATE_LABEL } from "@/data/labels"
import type { ToolRun } from "@/data/types"

/** 运行记录的筛选：全部，或者只看某一种状态（完成的不单独筛） */
export type RunFilter = "all" | "waiting" | "running" | "failed"

export const RUN_FILTER_OPTIONS: { value: RunFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "waiting", label: RUN_STATE_LABEL.waiting },
  { value: "running", label: RUN_STATE_LABEL.running },
  { value: "failed", label: RUN_STATE_LABEL.failed },
]

/** 地址栏的 state 参数：是「等你处理 / 运行中 / 失败」之一才算数，其余当作没写 */
export function parseRunFilter(value: string | null): Exclude<RunFilter, "all"> | null {
  return value === "waiting" || value === "running" || value === "failed" ? value : null
}

export function filterRuns(runs: ToolRun[], filter: RunFilter): ToolRun[] {
  return filter === "all" ? runs : runs.filter((run) => run.state === filter)
}

/** 地址栏的 run 参数：指向一条存在的运行才返回它的编号，否则当作没写 */
export function findRunId(runs: ToolRun[], id: string | null): string | null {
  return id !== null && runs.some((run) => run.id === id) ? id : null
}

/** 完成了几步、一共几步 */
export function stepCounts(run: ToolRun): { done: number; total: number } {
  return { done: run.steps.filter((step) => step.state === "done").length, total: run.steps.length }
}
