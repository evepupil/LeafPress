import type { Account } from "@leafpress/core"

export function defaultIdeaAccountId(accounts: readonly Pick<Account, "id" | "createdAt">[]): string | undefined {
  return [...accounts].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]?.id
}
