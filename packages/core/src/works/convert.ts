import { pickWorkflow } from "../workflows/index.ts"
import type { Account, Idea, IsoTime, PlatformId, Work, WorkSource } from "../types/index.ts"

export type ConvertSource =
  { kind: "idea"; idea: Idea } | { kind: "work"; work: Work; platform: PlatformId } | { kind: "new"; title: string }

/** 将 UI 的转作品来源映射到 Work.source。 */
export function workSourceOf(source: ConvertSource): WorkSource {
  if (source.kind === "idea") return { kind: "idea", ideaId: source.idea.id }
  if (source.kind === "work") return { kind: "work", workId: source.work.id }
  return { kind: "none" }
}

/** 转作品时的默认要求文字。 */
export function defaultBrief(source: ConvertSource): string {
  if (source.kind === "idea") return source.idea.detail
  if (source.kind === "work") return "照这个平台的写法改写，文末附原文链接。"
  return ""
}

/** 每个目标账号创建一个作品，使用调用方给定的编号、时间和起始排序位置。 */
export function convert(
  source: ConvertSource,
  accounts: Account[],
  brief: string,
  input: { at: IsoTime; ids: string[]; firstOrder: number },
): Work[] {
  if (input.ids.length < accounts.length) throw new Error("每个账号都需要一个作品编号")
  const workSource = workSourceOf(source)
  const title = source.kind === "idea" ? source.idea.text : source.kind === "work" ? source.work.title : source.title.trim()
  const fromText = source.kind === "idea" ? "由灵感转来" : source.kind === "work" ? `由《${source.work.title}》转来` : "直接新建"
  return accounts.map((account, index) => {
    // 问题链接可能贴在灵感标题里，也可能在要求里：两处一起认
    const workflow = pickWorkflow(account.platform, workSource, source.kind === "work" ? source.platform : undefined, `${title}\n${brief}`)
    return {
      id: input.ids[index] ?? "",
      title,
      accountId: account.id,
      status: "todo",
      brief: brief.trim(),
      source: workSource,
      workflowId: workflow.id,
      step: 0,
      order: input.firstOrder + index,
      createdAt: input.at,
      updatedAt: input.at,
      feedbackHistory: [],
      tags: [],
      log: [{ at: input.at, text: `创建，${fromText}，用「${workflow.name}」工作流` }],
    }
  })
}
