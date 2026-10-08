import type { MutationOk, PullInput, PullResult, SaveNoteInput } from "@leafpress/core"

import { mutate } from "./shared"

export async function pullNow(accountIds?: string[]): Promise<PullResult> {
  const body: PullInput = accountIds ? { accountIds } : {}
  return mutate<PullResult>("POST", "/api/data/pull", body)
}

export function saveNote(week: string, note: SaveNoteInput): Promise<MutationOk> {
  return mutate("PUT", `/api/notes/${encodeURIComponent(week)}`, note)
}
