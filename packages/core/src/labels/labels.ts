import type {
  AccountStage,
  DataMode,
  IdeaSource,
  IdeaStatus,
  PullStatus,
  SettingStatus,
  SetupState,
  SetupUse,
  StepKind,
  WorkStatus,
} from "../types/index.ts"

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
  crawler: "抓创作中心",
}

export const PULL_STATUS_LABEL: Record<PullStatus, string> = {
  ok: "正常",
  failed: "拉取失败",
  missing: "还没接",
}

export const SETUP_STATE_LABEL: Record<SetupState, string> = {
  ready: "接好了",
  broken: "有问题",
  unfinished: "没接完",
}

/** 配置项用在哪：拉数据用、投稿用、写稿发布用 */
export const SETUP_USE_LABEL: Record<SetupUse, string> = {
  data: "拉数据用",
  publish: "投稿用",
  write: "写稿、发布用",
}

/** 一个配置项现在的状态：已配置 / 未配置 / 已过期 */
export const SETTING_STATUS_LABEL: Record<SettingStatus, string> = {
  ok: "已配置",
  missing: "未配置",
  expired: "已过期",
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

export const METRIC_LABEL = {
  followers: "粉丝",
  reads: "浏览",
  interactions: "互动",
  posts: "发布",
} as const
