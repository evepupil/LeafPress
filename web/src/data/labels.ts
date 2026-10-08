import type {
  AccountStage,
  DataMode,
  IdeaSource,
  IdeaStatus,
  MaterialKind,
  PubFormat,
  PubState,
  RunState,
  StepKind,
  ToolStatus,
  WorkStatus,
} from "./types"

/** 界面上的状态文字统一从这里取，各页说法一致 */

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  idea: "灵感",
  writing: "在写",
  ready: "待发",
  published: "已发",
}

export const WORK_STATUS_ORDER: WorkStatus[] = ["idea", "writing", "ready", "published"]

export const PUB_STATE_LABEL: Record<PubState, string> = {
  published: "已发",
  "pending-link": "待回填",
  scheduled: "已排期",
  draft: "草稿",
}

export const PUB_FORMAT_LABEL: Record<PubFormat, string> = {
  article: "长文",
  answer: "回答",
  post: "图文",
  video: "视频",
  cards: "卡片",
}

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
  scheduled: "已排期",
  converted: "已转作品",
  shelved: "搁置",
}

export const IDEA_STATUS_ORDER: IdeaStatus[] = ["inbox", "promising", "scheduled", "converted", "shelved"]

export const IDEA_SOURCE_LABEL: Record<IdeaSource, string> = {
  quick: "随手记",
  devlog: "开发记录",
  cloudmind: "CloudMind",
  bookmark: "收藏",
  trend: "热点",
}

export const MATERIAL_KIND_LABEL: Record<MaterialKind, string> = {
  progress: "进度",
  review: "评审",
  commit: "提交",
}

export const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  ready: "可用",
  "needs-setup": "需配置",
  planned: "规划中",
}

export const RUN_STATE_LABEL: Record<RunState, string> = {
  waiting: "等你处理",
  running: "运行中",
  done: "完成",
  failed: "失败",
}

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  code: "代码",
  ai: "AI",
  confirm: "你确认",
  handoff: "外部工具",
  manual: "你动手",
}

export const METRIC_LABEL = {
  followers: "粉丝",
  reads: "阅读",
  interactions: "互动",
  posts: "发布",
} as const
