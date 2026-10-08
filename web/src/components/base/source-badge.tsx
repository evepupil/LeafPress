import { cn } from "cn"

import { DATA_MODE_LABEL } from "@/data/labels"
import type { DataSource, PullStatus } from "@/data/types"
import { formatRelative } from "@/lib/format"

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

/** 数据获取状态：小圆点 + 「平台接口 · 3 小时前」/「拉取失败 · 3 小时前」/「数据还没接」 */
export function SourceBadge({ source, className }: { source: DataSource; className?: string }) {
  const when = source.lastPullAt ? formatRelative(source.lastPullAt) : ""
  const text =
    source.status === "missing"
      ? "数据还没接"
      : source.status === "failed"
        ? `拉取失败 · ${when}`
        : `${DATA_MODE_LABEL[source.mode]} · ${when}`
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", TEXT[source.status], className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: DOT[source.status] }} />
      <span className="truncate">{text}</span>
    </span>
  )
}
