import type { DayKey, IsoTime } from "./common.ts"
import type { DataMode, MetricDef, PlatformId, SetupItemDef } from "./platform.ts"
import type { WorkflowDef } from "./workflow.ts"

export type AccountStage = "active" | "preparing" | "paused"

/** 一个配置项现在的状态：配好了、没配、过期了（用的时候被平台拒绝，比如密钥失效） */
export type SettingStatus = "ok" | "missing" | "expired"

/** 一个配置项现在的值和状态 */
export interface SettingView {
  key: string
  /** 普通配置的值；密钥永远没有这个字段 */
  value?: string
  status: SettingStatus
  /** 过期的原因，例如「统计接口返回 401」 */
  reason?: string
}

export interface Account {
  /** 平台 + 序号：zhihu-1、blog-2 */
  id: string
  platform: PlatformId
  name: string
  /** 平台上的用户名、主页短名 */
  handle?: string
  /** 主页地址 */
  url?: string
  stage: AccountStage
  /** 哪天开始用 LeafPress 管这个号 */
  since: DayKey
  /** 账号档案：一份随便写的 Markdown 原文（来自 profilePath 这个文件；没写为空串） */
  profile: string
  /** 档案文件的绝对路径 */
  profilePath: string
  /** 这个平台要配的东西现在的状态，顺序同平台的 setupItems */
  settings: SettingView[]
  createdAt: IsoTime
  updatedAt: IsoTime
}

/** 拉得怎么样：正常、拉取失败、还没接（拿数据的工具还没做） */
export type PullStatus = "ok" | "failed" | "missing"

/** 一次拉数据的结果（每个账号一条） */
export interface PullRecord {
  accountId: string
  at: IsoTime
  status: "ok" | "failed"
  /** 失败原因，给人看，不含密钥 */
  reason?: string
  /** 怎么修 */
  fixHint?: string
  /** 成功时的一句话，例如「入库 32 个作品」 */
  note?: string
}

/** 一个账号接得怎么样：接好了、有问题（原来能用的坏了）、没接完（还缺工作流、工具或配置） */
export type SetupState = "ready" | "broken" | "unfinished"

/** 数据获取现在的情况 */
export interface DataSourceView {
  /** 拿数据的工具还没做时为 missing；做了但还没拉过时为 ok 且没有 lastPullAt */
  status: PullStatus
  mode?: DataMode
  provider?: string
  /** 什么时候拉，例如「每天 06:00」；还没装定时任务时没有这个字段 */
  schedule?: string
  lastPullAt?: IsoTime
  failReason?: string
  fixHint?: string
}

/** 配置项的定义加上现在的值和状态 */
export interface SetupItemView extends SetupItemDef {
  value?: string
  status: SettingStatus
  reason?: string
}

/** 账号详情里「接入」一块要的全部东西（算出来的，不存） */
export interface SetupView {
  /** 这个平台能用的工作流：专用的在前，通用的在后 */
  workflows: WorkflowDef[]
  /** 这个账号现在就能用的（要的配置项都配好了） */
  usableWorkflows: WorkflowDef[]
  /** 有没有这个平台专用的工作流；只有通用的不算接好 */
  hasPlatformWorkflow: boolean
  source: DataSourceView
  /** 能拿到的数据：这个平台作品的数据项 */
  metrics: MetricDef[]
  items: SetupItemView[]
  state: SetupState
  /** 还缺什么，一句一样 */
  gaps: string[]
}
