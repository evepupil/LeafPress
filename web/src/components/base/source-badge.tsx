"use client"

import { cn } from "cn"
import { DATA_MODE_LABEL, PULL_STATUS_LABEL, formatRelative, type DataSourceView, type PullStatus } from "@leafpress/core"

import { useNow } from "@/lib/local-clock"

const DOT: Record<PullStatus, string> = {
  ok: "var(--team)",
  failed: "var(--risk)",
  missing: "var(--idle)",
}

const TEXT: Record<PullStatus, string> = {
  ok: "text-fg-2",
  failed: "text-bad",
  missing: "text-fg-2",
}

/** 拿数据的工具做好了但还没拉过（第一次拉之前）：状态是 ok，没有上次拉取时间 */
function isNeverPulled(source: DataSourceView): boolean {
  return source.status === "ok" && !source.lastPullAt
}

function badgeText(source: DataSourceView, when: string): string {
  if (source.status === "missing") return PULL_STATUS_LABEL.missing
  if (isNeverPulled(source)) return "还没拉过"
  const label = source.status === "failed" ? PULL_STATUS_LABEL.failed : source.mode ? DATA_MODE_LABEL[source.mode] : "数据来源"
  return when ? `${label} · ${when}` : label
}

export function SourceBadge({ source, className }: { source: DataSourceView; className?: string }) {
  const now = useNow()
  const when = source.lastPullAt && now ? formatRelative(source.lastPullAt, now) : ""
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", TEXT[source.status], className)}>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: isNeverPulled(source) ? DOT.missing : DOT[source.status] }}
      />
      <span className="truncate">{badgeText(source, when)}</span>
    </span>
  )
}
