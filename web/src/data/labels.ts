import type { AccountStage, DataMode, IdeaSource, IdeaStatus, StepKind, WorkStatus, WorkflowStatus } from "./types"

/** 界面上的状态文字统一从这里取，各页说法一致 */

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  todo: "待实现",
  doing: "进行中",
  waiting: "等你处理",
  done: "已完成",
}

/** 作品看板从左到右的列 */
export const WORK_STATUS_ORDER: WorkStatus[] = ["todo", "doing", "waiting", "done"]

export const STAGE_LABEL: Record<AccountStage, string> = {
  active: "运营中",
  preparing: "筹备中",
  paused: "暂停",
}

export const DATA_MODE_LABEL: Record<DataMode, string> = {
  api: "平台接口",
  analytics: "网站统计",
  manual: "手填",
}

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  inbox: "收件箱",
  promising: "值得写",
  converted: "已转作品",
}

/** 灵感看板从左到右的列，最右边是已转作品 */
export const IDEA_STATUS_ORDER: IdeaStatus[] = ["inbox", "promising", "converted"]

export const IDEA_SOURCE_LABEL: Record<IdeaSource, string> = {
  quick: "随手记",
  devlog: "开发记录",
  cloudmind: "CloudMind",
  trend: "热点",
  bookmark: "收藏",
  batch: "AI 批量",
  schedule: "定时跑",
}

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  ai: "AI",
  code: "自动",
  manual: "你来",
}

export const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  ready: "可用",
  "needs-setup": "需配置",
}

export const METRIC_LABEL = {
  followers: "粉丝",
  reads: "阅读",
  interactions: "互动",
  posts: "发布",
} as const
