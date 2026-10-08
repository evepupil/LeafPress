import type {
  Account,
  CodeOutcome,
  Idea,
  IdeaStatus,
  IsoTime,
  MetricsDataset,
  PlatformInfo,
  SetupView,
  WeeklyNote,
  Work,
  WorkflowDef,
  WorkflowStep,
  WorkStatus,
} from "../types/index.ts"
import type { Bootstrap, Version } from "./bootstrap.ts"
import type {
  AddAccountInput,
  AddIdeaInput,
  CreateWorksInput,
  MoveIdeaInput,
  MoveWorkInput,
  PullOutcome,
  SaveNoteInput,
  UpdateAccountInput,
  UpdateIdeaInput,
  UpdateWorkInput,
} from "./requests.ts"

/**
 * 用例的门面：命令行和本机服务都只通过它办事（实现在 src/usecases/，见 docs/模块设计/用例-业务用例.md）。
 * 出错一律抛 LeafPressError（错误码 USAGE、NOT_FOUND、STATE_CONFLICT、STEP_OUTPUT_INVALID、STORE_FAILED、INTERNAL……）。
 */

/** 一个作品的完整情况：`leafpress work show`、接手后给 agent 的都是它 */
export interface WorkDetail {
  work: Work
  account: Account
  platform: PlatformInfo
  workflow: WorkflowDef
  /** 任务文件夹（绝对路径） */
  folder: string
  /** 任务文件夹里的产出文件（相对路径，不含说明文件） */
  files: string[]
  /** 当前步骤；已完成时没有 */
  step?: WorkflowStep
  /** 当前是 AI 步骤时：要产出、但文件夹里还没有的文件 */
  missing: string[]
  /** 完整任务说明（同任务文件夹里的 作品.md、网页的「复制给 AI」） */
  context: string
}

/** 给 agent 的租约：令牌只在接手时出现一次，之后推进作品都要带上 */
export interface LeaseGrant {
  token: string
  expiresAt: IsoTime
}

export interface StartResult {
  detail: WorkDetail
  /** 接手后是进行中才有；直接停在等你处理或已完成时没有 */
  lease?: LeaseGrant
  /** 一句话：「接手了：写稿」「读了你的反馈，接着做：归档链接」「这一步要作者来做，已停在等你处理」 */
  message: string
}

export interface StepResult {
  detail: WorkDetail
  /** 仍是进行中时：续过期的租约（令牌不变） */
  lease?: LeaseGrant
  /** 一句话：「下一步：归档链接（自动），运行 leafpress work run」「停在等你处理：你去发布」「已完成」 */
  message: string
}

export interface RunResult extends StepResult {
  outcome: CodeOutcome
}

export interface AccountDetail {
  account: Account
  setup: SetupView
}

export interface PullSummary {
  outcomes: PullOutcome[]
  note: string
}

export interface UseCases {
  // ---------- 作品：网页和命令行都用 ----------
  /** 按状态（待实现、进行中、等你处理、已完成）分组，组内按看板的顺序 */
  listWorks(filter?: { status?: WorkStatus[]; accountId?: string }): Work[]
  showWork(id: string): WorkDetail
  createWorks(input: CreateWorksInput): Work[]
  updateWork(id: string, patch: UpdateWorkInput): Work
  moveWork(id: string, input: MoveWorkInput): Work
  submitFeedback(id: string, text: string): Work
  deleteWork(id: string): void
  /** 在资源管理器里打开任务文件夹，返回路径 */
  openWorkFolder(id: string): Promise<string>

  // ---------- 作品：agent 用 ----------
  /** 接手指定作品；force：租约还没到期也接管（agent 自己丢了令牌时用） */
  startWork(input: { id: string; force?: boolean }): StartResult
  /** 接手待实现里排最前、工作流能用的一个；没有返回 undefined */
  startNext(input?: { accountId?: string }): StartResult | undefined
  /** AI 步骤做完；force：跳过「产出文件在不在」的检查 */
  stepWork(id: string, token: string, options?: { force?: boolean }): StepResult
  /** 执行当前的代码步骤 */
  runWork(id: string, token: string): Promise<RunResult>
  /** 退回到第 stepNumber 步（1 起）重做 */
  backWork(id: string, token: string, stepNumber: number): StepResult
  /** 交还：回到待实现最前面 */
  releaseWork(id: string, token: string): Work

  // ---------- 灵感 ----------
  listIdeas(filter?: { status?: IdeaStatus[] }): Idea[]
  /** 一次加多条：按传入的顺序排在收件箱最前面 */
  addIdeas(inputs: AddIdeaInput[]): Idea[]
  updateIdea(id: string, patch: UpdateIdeaInput): Idea
  moveIdea(id: string, input: MoveIdeaInput): Idea
  deleteIdea(id: string): void

  // ---------- 账号 ----------
  listAccounts(): Account[]
  showAccount(id: string): AccountDetail
  addAccount(input: AddAccountInput): Account
  updateAccount(id: string, patch: UpdateAccountInput): Account
  saveProfile(id: string, profile: string): Account
  /** value 去首尾空白后为空表示清掉 */
  setSetting(id: string, key: string, value: string): Account

  // ---------- 数据与周报 ----------
  pullData(input?: { accountIds?: string[] }): Promise<PullSummary>
  dataset(): MetricsDataset
  saveNote(week: string, input: SaveNoteInput): WeeklyNote

  // ---------- 整体 ----------
  bootstrap(): Bootstrap
  version(): Version
  exportBackup(): { dir: string }
}
