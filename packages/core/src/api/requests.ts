import type { Account, AccountStage, Idea, IdeaSource, PlatformId, Work } from "../types/index.ts"
import type { Version } from "./bootstrap.ts"

/**
 * 本机服务的请求和返回。请求体都是 JSON，服务端先用 zod 校验；
 * 改数据的接口成功时都回 { ok: true, version, ...各自的结果 }，失败回 { ok: false, error }。
 */

// ---------- 作品 ----------

/** 转作品的来源：一条灵感、一个已有作品，或者直接新建（给标题） */
export type ConvertSourceInput = { kind: "idea"; ideaId: string } | { kind: "work"; workId: string } | { kind: "new"; title: string }

/** POST /api/works：选几个账号生成几个作品 */
export interface CreateWorksInput {
  source: ConvertSourceInput
  accountIds: string[]
  brief: string
}

/** PATCH /api/works/:id；null 表示清空 */
export interface UpdateWorkInput {
  title?: string
  brief?: string
  /** 只有还没开始做（待实现且在第 0 步）时能换 */
  workflowId?: string
  url?: string | null
  question?: string | null
}

/** POST /api/works/:id/move：拖动卡片。挪到待实现时排在 beforeId 前面（null 放最后） */
export interface MoveWorkInput {
  status: "todo" | "waiting" | "done"
  beforeId: string | null
}

/** POST /api/works/:id/feedback */
export interface FeedbackInput {
  text: string
}

// ---------- 灵感 ----------

/** POST /api/ideas */
export interface AddIdeaInput {
  text: string
  detail?: string
  accountId?: string
  source: IdeaSource
  sourceDetail?: string
}

/** PATCH /api/ideas/:id；null 表示清空 */
export interface UpdateIdeaInput {
  text?: string
  detail?: string
  accountId?: string | null
}

/** POST /api/ideas/:id/move：已转作品的灵感不能拖 */
export interface MoveIdeaInput {
  status: "inbox" | "promising"
  beforeId: string | null
}

// ---------- 账号 ----------

/** POST /api/accounts：intro 写成档案的第一段；settings 是这个平台的配置项（可以先不填） */
export interface AddAccountInput {
  platform: PlatformId
  name: string
  intro: string
  handle?: string
  url?: string
  settings?: Record<string, string>
}

/** PATCH /api/accounts/:id；null 表示清空 */
export interface UpdateAccountInput {
  name?: string
  handle?: string | null
  url?: string | null
  stage?: AccountStage
}

/** PUT /api/accounts/:id/profile */
export interface SaveProfileInput {
  profile: string
}

/** PUT /api/accounts/:id/settings/:key；空串表示清掉 */
export interface SetSettingInput {
  value: string
}

// ---------- 数据与周报 ----------

/** POST /api/data/pull；不传 accountIds 表示全部账号 */
export interface PullInput {
  accountIds?: string[]
}

/** PUT /api/notes/:week */
export interface SaveNoteInput {
  wins: string
  improve: string
  next: string
}

// ---------- 返回 ----------

export interface ApiError {
  /** 和命令行的错误码一致：USAGE、NOT_FOUND、STATE_CONFLICT…… */
  code: string
  message: string
  hint?: string
}

export interface ApiFailure {
  ok: false
  error: ApiError
}

/** 改数据的接口成功时都带上新的变更序号 */
export interface MutationOk {
  ok: true
  version: Version
}

export interface CreateWorksResult extends MutationOk {
  works: Work[]
}

export interface AddIdeaResult extends MutationOk {
  idea: Idea
}

export interface AddAccountResult extends MutationOk {
  account: Account
}

export interface PullOutcome {
  accountId: string
  status: "ok" | "failed"
  reason?: string
}

/** 拿数据的工具还没做的账号不在 outcomes 里 */
export interface PullResult extends MutationOk {
  outcomes: PullOutcome[]
  /** 给提示条的一句话：「全部入库」「博客：统计接口返回 401，其余已入库」「没有能拉的账号」 */
  note: string
}

export interface ExportResult extends MutationOk {
  /** 导出到的文件夹 */
  dir: string
}

/** POST /api/works/:id/open-folder：在资源管理器里打开任务文件夹 */
export interface OpenFolderResult {
  ok: true
  path: string
}
