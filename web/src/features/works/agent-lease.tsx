"use client"

import { formatDuration, type Work } from "@leafpress/core"
import { Bot } from "lucide-react"

export function AgentLeaseStatus({ work, now }: { work: Work; now?: string }) {
  if (work.status !== "doing") return null

  const lease = work.lease
  const nowMs = now ? Date.parse(now) : Number.NaN
  const expiresAtMs = lease ? Date.parse(lease.expiresAt) : Number.NaN
  const leaseKnown = Number.isFinite(nowMs) && Number.isFinite(expiresAtMs)
  const expired = Boolean(lease && leaseKnown && expiresAtMs <= nowMs)
  const stateCode = !lease ? "unclaimed" : !leaseKnown ? "unknown" : expired ? "expired" : "active"
  const active = Boolean(lease && leaseKnown && !expired)
  const message = !lease ? "Agent 未接手" : !leaseKnown ? "Agent 状态待同步" : expired ? "租约已到期" : undefined

  return (
    <span data-agent-status={stateCode} className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-fg-2">
      <Bot className="size-3.5 shrink-0 text-fg-3" aria-hidden />
      {active && lease ? (
        <span className="min-w-0 truncate">
          agent 在做 · <time dateTime={lease.expiresAt}>{formatDuration(now!, lease.expiresAt)}后到期</time>
        </span>
      ) : (
        <span className="min-w-0 truncate">{message}</span>
      )}
    </span>
  )
}
