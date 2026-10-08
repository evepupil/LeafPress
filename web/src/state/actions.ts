"use client"

import { DEMO_NOW } from "@/data/clock"
import type { Work } from "@/data/types"
import type { ConvertSource } from "@/lib/work-engine"
import { useIdeas } from "./ideas"
import { useSchedules } from "./schedules"
import { useWorks } from "./works"

/** 要同时改几份数据的动作 */

/** 转作品：生成作品；来源是灵感时，灵感挪到「已转作品」并记下作品编号 */
export function convertToWorks(source: ConvertSource, accountIds: string[], brief: string): Work[] {
  const works = useWorks.getState().create(source, accountIds, brief)
  if (source.kind === "idea") {
    useIdeas.getState().linkWorks(
      source.idea.id,
      works.map((work) => work.id),
    )
  }
  return works
}

/** 恢复初始数据：作品和灵感都回到 src/data 里的样子 */
export function resetAll() {
  useWorks.getState().reset()
  useIdeas.getState().reset()
}

/** 定时工作流现在跑一次，返回给 toast 的一句话 */
export function runSchedule(id: string): string {
  const record = useSchedules.getState().record
  if (id === "idea-harvest") {
    const added = useIdeas.getState().harvest()
    const note = added.length > 0 ? `新增 ${added.length} 条灵感` : "没有新的灵感"
    record(id, { lastRunAt: DEMO_NOW, lastResult: "ok", lastNote: note })
    return note
  }
  if (id === "data-pull") {
    const note = "博客统计接口返回 401，其余已入库"
    record(id, { lastRunAt: DEMO_NOW, lastResult: "failed", lastNote: note })
    return note
  }
  const note = "9月28日 – 10月4日 周报已生成"
  record(id, { lastRunAt: DEMO_NOW, lastResult: "ok", lastNote: note })
  return note
}
