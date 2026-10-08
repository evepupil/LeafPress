import type {
  CreateWorksInput,
  CreateWorksResult,
  FeedbackInput,
  MoveWorkInput,
  MutationOk,
  OpenFolderResult,
  UpdateWorkInput,
  Work,
  WorkDetail,
} from "@leafpress/core"

import { getJson, send } from "../api"
import { useData } from "../data"
import { mutate } from "./shared"

const path = (id: string) => `/api/works/${encodeURIComponent(id)}`

export async function createWorks(input: CreateWorksInput): Promise<Work[]> {
  return (await mutate<CreateWorksResult>("POST", "/api/works", input)).works
}

export function updateWork(id: string, patch: UpdateWorkInput): Promise<MutationOk> {
  return mutate("PATCH", path(id), patch)
}

export function moveWork(id: string, status: MoveWorkInput["status"], beforeId: string | null): Promise<MutationOk> {
  return mutate("POST", `${path(id)}/move`, { status, beforeId } satisfies MoveWorkInput)
}

export function submitFeedback(id: string, text: string): Promise<MutationOk> {
  return mutate("POST", `${path(id)}/feedback`, { text } satisfies FeedbackInput)
}

export function deleteWork(id: string): Promise<MutationOk> {
  return mutate("DELETE", path(id))
}

export async function openFolder(id: string): Promise<OpenFolderResult> {
  try {
    return await send<OpenFolderResult>("POST", `${path(id)}/open-folder`)
  } catch (error) {
    await useData.getState().sync(undefined, true)
    throw error
  }
}

export function loadWorkDetail(id: string): Promise<WorkDetail> {
  return getJson<WorkDetail>(path(id))
}
