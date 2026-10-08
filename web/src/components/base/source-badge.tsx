"use client"

import { cn } from "cn"
import { DATA_MODE_LABEL, PULL_STATUS_LABEL, formatRelative, type DataSourceView, type PullStatus } from "@leafpress/core"

import { useData } from "@/state/data"

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

export function SourceBadge({ source, className }: { source: DataSourceView; className?: string }) {
  const now = useData((state) => state.boot?.now)
  const when = source.lastPullAt ? formatRelative(source.lastPullAt, now ?? source.lastPullAt) : ""
  const text =
    source.status === "missing"
      ? PULL_STATUS_LABEL.missing
      : source.status === "failed"
        ? `拉取失败 · ${when}`
        : `${source.mode ? DATA_MODE_LABEL[source.mode] : "数据来源"} · ${when}`
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", TEXT[source.status], className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: DOT[source.status] }} />
      <span className="truncate">{text}</span>
    </span>
  )
}
