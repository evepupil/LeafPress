import type { MutationOk } from "@leafpress/core"

import { send } from "../api"
import { useData } from "../data"

export async function mutate<T extends MutationOk>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  try {
    const result = await send<T>(method, path, body)
    await useData.getState().sync(result.version)
    return result
  } catch (error) {
    await useData.getState().sync(undefined, true)
    throw error
  }
}
