import type { IsoTime } from "./common.ts"

/** 定时工作流：不针对某个作品、按时自己跑的流程 */
export interface ScheduleView {
  /** data-pull：拉作品数据（电脑的计划任务）；idea-harvest：跑灵感（AI 工具的定时任务） */
  id: "data-pull" | "idea-harvest"
  name: string
  summary: string
  /** 「每天 06:00」 */
  when: string
  /** 装上没有 */
  installed: boolean
  lastRunAt?: IsoTime
  lastResult?: "ok" | "failed"
  lastNote?: string
}
