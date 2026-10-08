"use client"

import { ACCOUNTS } from "@/data/accounts"
import { DEMO_NOW } from "@/data/clock"
import type { Work } from "@/data/types"
import { pullData } from "@/lib/setup"
import type { ConvertSource } from "@/lib/work-engine"
import { useAccounts } from "./accounts"
import { useIdeas } from "./ideas"
import { useSchedules } from "./schedules"
import { useWorks } from "./works"

/** 要同时改几份数据的动作 */

/** 转作品：生成作品；来源是灵感时，灵感挪到「已转作品」并记下作品编号 */
export function convertToWorks(source: ConvertSource, accountIds: string[], brief: string): Work[] {
  const works = useWorks.getState().create(source, accountIds, brief)
  if (source.kind === "idea") {
    useIdeas.getState().linkWorks(
      source.idea.id,
      works.map((work) => work.id),
    )
  }
  return works
}

/** 恢复初始数据：作品、灵感、账号档案和接入配置都回到 src/data 里的样子 */
export function resetAll() {
  useWorks.getState().reset()
  useIdeas.getState().reset()
  useAccounts.getState().reset()
}

/**
 * 拉一次数据：按接入里现在的配置拉各账号（拿数据的工具还没做的跳过），结果记到账号上；
 * accountIds 不传就拉全部。返回给提示条的一句话
 */
export function pullNow(accountIds?: string[]): { ok: boolean; note: string } {
  const accounts = useAccounts.getState()
  const targets = accountIds ? ACCOUNTS.filter((account) => accountIds.includes(account.id)) : ACCOUNTS
  const { outcomes, note } = pullData(targets, accounts.config)
  accounts.recordPulls(outcomes, DEMO_NOW)
  return { ok: outcomes.every((item) => item.status === "ok"), note }
}

/** 定时工作流现在跑一次，返回给 toast 的一句话 */
export function runSchedule(id: string): string {
  const record = useSchedules.getState().record
  if (id === "idea-harvest") {
    const added = useIdeas.getState().harvest()
    const note = added.length > 0 ? `新增 ${added.length} 条灵感` : "没有新的灵感"
    record(id, { lastRunAt: DEMO_NOW, lastResult: "ok", lastNote: note })
    return note
  }
  if (id === "data-pull") {
    const { ok, note } = pullNow()
    record(id, { lastRunAt: DEMO_NOW, lastResult: ok ? "ok" : "failed", lastNote: note })
    return note
  }
  const note = "9月28日 – 10月4日 周报已生成"
  record(id, { lastRunAt: DEMO_NOW, lastResult: "ok", lastNote: note })
  return note
}
