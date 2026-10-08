import type { DayKey, IsoTime } from "./common.ts"
import type { PlatformId } from "./platform.ts"
import type { StepKind } from "./workflow.ts"

/** 作品状态：待实现（agent 的待做，按先后排队）→ 进行中（有 agent 在做）→ 等你处理 → 已完成 */
export type WorkStatus = "todo" | "doing" | "waiting" | "done"

/** 作品从哪来 */
export type WorkSource =
  | { kind: "idea"; ideaId: string }
  /** 由另一个作品转来，例如博客文章转知乎 */
  | { kind: "work"; workId: string }
  /** 从平台导入的已有作品（例如博客仓库里的文章） */
  | { kind: "import" }
  /** 直接新建 */
  | { kind: "none" }

/** 累计数据，键是平台数据项的 key */
export type WorkTotals = Record<string, number>

/** 作品里的一条记录 */
export interface WorkLog {
  at: IsoTime
  text: string
}

/** 你提交过的一条反馈 */
export interface FeedbackEntry {
  at: IsoTime
  /** 提交时作品停在第几步（0 起） */
  step: number
  /** 那一步的名字 */
  stepName: string
  text: string
}

/** 进行中的作品由谁在做。令牌只交给接手的 agent，不出现在这里 */
export interface WorkLease {
  since: IsoTime
  expiresAt: IsoTime
}

/** 代码步骤的结果：平台适配的实现返回它，共享规则据此改作品 */
export type CodeOutcome =
  /** 做完了；有的步骤顺带拿到发布链接和发布日期 */
  | { kind: "done"; url?: string; publishedAt?: DayKey; note?: string }
  /** 要作者处理（比如反馈里没找到链接）：作品停在等你处理，步骤不动 */
  | { kind: "ask"; ask: string; note?: string }
  /** 出错了：作品仍是进行中，记下原因，agent 可以重试或告诉作者 */
  | { kind: "fail"; error: string }

/** 任务文件夹里 状态.json 的内容：agent 读它最快知道作品在哪一步 */
export interface TaskState {
  id: string
  title: string
  accountId: string
  platform: PlatformId
  status: WorkStatus
  /** 状态的中文名 */
  statusText: string
  /** 第几步，0 起 */
  step: number
  stepCount: number
  currentStep?: { id: string; name: string; kind: StepKind }
  workflowId: string
  ask?: string
  feedback?: string
  url?: string
  lease?: WorkLease
  error?: string
  updatedAt: IsoTime
}

/** 一个作品 = 一个平台上的一份内容，也是一条任务 */
export interface Work {
  id: string
  title: string
  /** 发在哪个账号；平台由账号决定 */
  accountId: string
  status: WorkStatus
  /** 要写什么、有什么要求。agent 从这里读 */
  brief: string
  source: WorkSource
  /** 用哪个工作流（创建时按平台和来源自动配；还没开始做时能换） */
  workflowId: string
  /** 工作流走到第几步（0 起）；已完成时等于步骤总数 */
  step: number
  /** 等你处理时：要你做的事 */
  ask?: string
  /** 你对当前这一步的反馈：agent 接手时读；进到下一个要你动手的步骤时清空（历史见 feedbackHistory） */
  feedback?: string
  /** 你提交过的全部反馈，按时间先后 */
  feedbackHistory: FeedbackEntry[]
  /** 待实现一列里的先后，小的在前，agent 按这个顺序挑 */
  order: number
  createdAt: IsoTime
  updatedAt: IsoTime
  /** 发布后的地址 */
  url?: string
  publishedAt?: DayKey
  /** 最近一次拉到的累计数据 */
  totals?: WorkTotals
  /** totals 是哪天的 */
  totalsDay?: DayKey
  /** 回答挂的问题 */
  question?: string
  /** 平台原稿在本机的位置（例如导入的博客文章） */
  localPath?: string
  /** 平台原稿的编号（博客：zh/xxx） */
  sourceRef?: string
  tags: string[]
  /** 进行中时：接手的 agent 的租约 */
  lease?: WorkLease
  /** 最近一次代码步骤失败的原因；下一次成功推进时清空 */
  error?: string
  /** 作品的记录，按时间先后 */
  log: WorkLog[]
}
