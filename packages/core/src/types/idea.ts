import type { IsoTime } from "./common.ts"

/** 灵感状态：收件箱 → 值得写 → 已转作品 */
export type IdeaStatus = "inbox" | "promising" | "converted"

/** 灵感从哪来：随手记、开发记录、CloudMind 记忆、热点、收藏、AI 批量、定时跑灵感 */
export type IdeaSource = "quick" | "devlog" | "cloudmind" | "trend" | "bookmark" | "batch" | "schedule"

export interface Idea {
  id: string
  /** 一句话 */
  text: string
  /** 细节：想写什么、素材在哪 */
  detail: string
  status: IdeaStatus
  source: IdeaSource
  /** 来源补充：哪个项目、哪条记忆、哪个链接 */
  sourceDetail?: string
  /** 倾向发在哪个账号（可选） */
  accountId?: string
  /** 列里的先后，小的在前 */
  order: number
  createdAt: IsoTime
  updatedAt: IsoTime
  /** 由这条灵感转出去的作品（按作品的来源算出来，不单独存） */
  workIds: string[]
}
