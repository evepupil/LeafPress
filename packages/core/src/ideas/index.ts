import type { Idea, IdeaStatus, IsoTime } from "../types/index.ts"
import type { RuleFailure } from "../works/engine.ts"

export * from "./candidates.ts"

export type IdeaResult = { ok: true; idea: Idea } | RuleFailure

/** 一列内按 order，再按创建时间从新到旧排列。 */
export function sortIdeas(ideas: Idea[], status: IdeaStatus): Idea[] {
  return ideas.filter((idea) => idea.status === status).sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt))
}

/** 计算目标列拖动后的完整 order 映射。 */
export function reorderIdeas(ideas: Idea[], id: string, status: IdeaStatus, beforeId: string | null): Map<string, number> {
  const column = sortIdeas(ideas, status).filter((idea) => idea.id !== id)
  const index = beforeId === null ? -1 : column.findIndex((idea) => idea.id === beforeId)
  const moving = ideas.find((idea) => idea.id === id)
  if (moving) column.splice(index === -1 ? column.length : index, 0, moving)
  return new Map(column.map((idea, i) => [idea.id, i + 1]))
}

/** 新灵感排到指定列的最前面。 */
export function topIdeaOrder(ideas: Idea[], status: IdeaStatus): number {
  return ideas.filter((idea) => idea.status === status).reduce((min, idea) => Math.min(min, idea.order), 1) - 1
}

export function newIdeaId(serial: number): string {
  return `i-${serial}`
}

/** 将未转作品的灵感挪到收件箱或值得写。 */
export function moveIdea(idea: Idea, status: "inbox" | "promising", input: { at: IsoTime; order: number }): IdeaResult {
  if (idea.status === "converted") return { ok: false, code: "STATE_CONFLICT", reason: "已经转成作品了" }
  return { ok: true, idea: { ...idea, status, order: input.order, updatedAt: input.at } }
}

/** 更新灵感内容；null 明确表示清除账号关联。 */
export function updateIdea(
  idea: Idea,
  patch: { text?: string; detail?: string; accountId?: string | null },
  input: { at: IsoTime },
): IdeaResult {
  if (patch.text !== undefined && !patch.text.trim()) return { ok: false, code: "INVALID", reason: "灵感内容不能为空" }
  const updated: Idea = {
    ...idea,
    ...(patch.detail === undefined ? {} : { detail: patch.detail }),
    ...(patch.text === undefined ? {} : { text: patch.text.trim() }),
    updatedAt: input.at,
  }
  if (patch.accountId === null) delete updated.accountId
  else if (patch.accountId !== undefined) updated.accountId = patch.accountId
  return { ok: true, idea: updated }
}

/** 记下转出的作品编号，去重并将灵感排到已转作品列最前面。 */
export function markConverted(idea: Idea, workIds: string[], input: { at: IsoTime; order: number }): Idea {
  return {
    ...idea,
    status: "converted",
    order: input.order,
    updatedAt: input.at,
    workIds: [...new Set([...idea.workIds, ...workIds])],
  }
}
