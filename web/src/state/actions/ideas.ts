import type { AddIdeaInput, AddIdeaResult, MutationOk, MoveIdeaInput, UpdateIdeaInput } from "@leafpress/core"

import { mutate } from "./shared"

const path = (id: string) => `/api/ideas/${encodeURIComponent(id)}`

export async function addIdea(input: AddIdeaInput) {
  return (await mutate<AddIdeaResult>("POST", "/api/ideas", input)).idea
}

export function updateIdea(id: string, patch: UpdateIdeaInput): Promise<MutationOk> {
  return mutate("PATCH", path(id), patch)
}

export function moveIdea(id: string, status: MoveIdeaInput["status"], beforeId: string | null): Promise<MutationOk> {
  return mutate("POST", `${path(id)}/move`, { status, beforeId } satisfies MoveIdeaInput)
}

export function deleteIdea(id: string): Promise<MutationOk> {
  return mutate("DELETE", path(id))
}
