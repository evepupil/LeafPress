import type { PullOutcome } from "../api/index.ts"
import type { Account, PlatformId, PlatformInfo } from "../types/index.ts"
import { setupItems } from "./setup.ts"

export type PullAction =
  { accountId: string; action: "skip" } | { accountId: string; action: "blocked"; reason: string } | { accountId: string; action: "pull" }

export function pullPlan(accounts: Account[], catalog: Record<PlatformId, PlatformInfo>): PullAction[] {
  return accounts.map((account) => {
    const platform = catalog[account.platform]
    if (!platform.dataTool) return { accountId: account.id, action: "skip" }
    const blocked = setupItems(platform, account.settings).find((item) => item.usedFor === "data" && item.status !== "ok")
    if (!blocked) return { accountId: account.id, action: "pull" }
    const suffix = blocked.status === "expired" ? "已过期" : "未配置"
    return { accountId: account.id, action: "blocked", reason: `${blocked.label}${suffix}` }
  })
}

export function pullNote(outcomes: PullOutcome[], accounts: Account[]): string {
  if (outcomes.length === 0) return "没有能拉的账号"
  const failed = outcomes.filter((outcome) => outcome.status === "failed")
  if (failed.length === 0) return "全部入库"
  const nameOf = (id: string) => accounts.find((account) => account.id === id)?.name ?? id
  const details = failed.map((outcome) => `${nameOf(outcome.accountId)}：${outcome.reason ?? "未知原因"}`).join("；")
  return `${details}${failed.length < outcomes.length ? "，其余已入库" : ""}`
}
