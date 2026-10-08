import { cn } from "cn"

import { DATA_MODE_LABEL } from "@/data/labels"
import type { DataSource, PullResult } from "@/data/types"
import { formatRelative } from "@/lib/format"

const DOT: Record<PullResult, string> = {
  ok: "var(--team)",
  failed: "var(--risk)",
  never: "var(--idle)",
}

const TEXT: Record<PullResult, string> = {
  ok: "text-fg-2",
  failed: "text-bad",
  never: "text-fg-2",
}

/** 数据来源状态：小圆点 + 「平台接口 · 3 小时前」/「拉取失败 · 3 小时前」/「还没有数据」 */
export function SourceBadge({ source, className }: { source: DataSource; className?: string }) {
  const when = source.lastPullAt ? formatRelative(source.lastPullAt) : ""
  const text =
    source.lastResult === "never"
      ? "还没有数据"
      : source.lastResult === "failed"
        ? `拉取失败 · ${when}`
        : `${DATA_MODE_LABEL[source.mode]} · ${when}`
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", TEXT[source.lastResult], className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: DOT[source.lastResult] }} />
      <span className="truncate">{text}</span>
    </span>
  )
}
