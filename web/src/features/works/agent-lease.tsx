"use client"

import { dayOf, formatDay, formatTime, type Work } from "@leafpress/core"
import { Bot } from "lucide-react"

export function AgentLeaseStatus({ work, now }: { work: Work; now?: string }) {
  if (work.status !== "doing") return null

  const lease = work.lease
  const nowMs = now ? Date.parse(now) : Number.NaN
  const expiresAtMs = lease ? Date.parse(lease.expiresAt) : Number.NaN
  const leaseKnown = Number.isFinite(nowMs) && Number.isFinite(expiresAtMs)
  const expired = Boolean(lease && leaseKnown && expiresAtMs <= nowMs)
  const state = !lease ? "未接手" : !leaseKnown ? "状态待同步" : expired ? "租约已到期" : "运行中"
  const stateCode = !lease ? "unclaimed" : !leaseKnown ? "unknown" : expired ? "expired" : "active"
  const expiresOn =
    lease && Number.isFinite(expiresAtMs)
      ? `${formatDay(dayOf(lease.expiresAt), now && Number.isFinite(nowMs) ? dayOf(now) : dayOf(lease.expiresAt))} ${formatTime(lease.expiresAt)}`
      : undefined

  return (
    <span data-agent-status={stateCode} className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-fg-2">
      <Bot className="size-3.5 shrink-0 text-fg-3" aria-hidden />
      <span className="shrink-0">Agent {state}</span>
      {lease && expiresOn && (
        <time dateTime={lease.expiresAt} title={`租约到期：${expiresOn}`} className="min-w-0 truncate tabular">
          · 租约到 {expiresOn}
        </time>
      )}
    </span>
  )
}
