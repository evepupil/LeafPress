import { IDEA_SOURCE_LABEL, reorderIdeas, type Idea, type IdeaStatus, type IsoTime, type UpdateIdeaInput, type Work } from "@leafpress/core"

export function moveIdeaPreview(
  ideas: Idea[],
  id: string,
  status: Exclude<IdeaStatus, "converted">,
  beforeId: string | null,
  now: IsoTime,
): Idea[] {
  const current = ideas.find((idea) => idea.id === id)
  if (!current || current.status === "converted") return ideas
  const moved = { ...current, status, updatedAt: now }
  const next = ideas.map((idea) => (idea.id === id ? moved : idea))
  const order = reorderIdeas(next, id, status, beforeId)
  return next.map((idea) => {
    const position = order.get(idea.id)
    return position === undefined ? idea : { ...idea, order: position }
  })
}

export function worksOf(idea: Idea, worksById: ReadonlyMap<string, Work>): Work[] {
  return idea.workIds.flatMap((id) => {
    const work = worksById.get(id)
    return work ? [work] : []
  })
}

export function sourceDetailOf(idea: Pick<Idea, "source" | "sourceDetail">): string | undefined {
  const detail = idea.sourceDetail?.trim()
  if (!detail) return undefined
  const label = IDEA_SOURCE_LABEL[idea.source]
  if (!detail.startsWith(label)) return detail
  const rest = detail.slice(label.length)
  if (rest !== "" && !/^[\s·]/.test(rest)) return detail
  return rest.replace(/^[\s·]+/, "") || undefined
}

export function draftPatch(saved: Idea, text: string, detail: string): UpdateIdeaInput | null {
  const patch: UpdateIdeaInput = {}
  const nextText = text.trim()
  const nextDetail = detail.trim()
  if (nextText && nextText !== saved.text) patch.text = nextText
  if (nextDetail !== (saved.detail ?? "")) patch.detail = nextDetail
  return Object.keys(patch).length > 0 ? patch : null
}
