import type { AddAccountInput, AddAccountResult, MutationOk, SaveProfileInput, SetSettingInput, UpdateAccountInput } from "@leafpress/core"

import { mutate } from "./shared"

const path = (id: string) => `/api/accounts/${encodeURIComponent(id)}`

export async function addAccount(input: AddAccountInput) {
  return (await mutate<AddAccountResult>("POST", "/api/accounts", input)).account
}

export function updateAccount(id: string, patch: UpdateAccountInput): Promise<MutationOk> {
  return mutate("PATCH", path(id), patch)
}

export function saveProfile(id: string, profile: string): Promise<MutationOk> {
  return mutate("PUT", `${path(id)}/profile`, { profile } satisfies SaveProfileInput)
}

export function setSetting(id: string, key: string, value: string): Promise<MutationOk> {
  return mutate("PUT", `${path(id)}/settings/${encodeURIComponent(key)}`, { value } satisfies SetSettingInput)
}
