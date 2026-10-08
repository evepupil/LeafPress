"use client"

import { cn } from "cn"
import { LayoutGrid } from "lucide-react"
import { useMemo } from "react"

import { ColorDot } from "@/components/base/marks"
import { ProgressMeter } from "@/components/base/progress-meter"
import { formatCount, formatPercent } from "@/lib/format"
import { columnRows } from "@/lib/metrics"
import { weekReport } from "@/lib/report"
import { useReportWeek } from "@/state/report-week"

/** 栏目名的颜色：这段时间一篇都没发的栏目淡一档 */
const NAME_TONE = { published: "text-fg", empty: "text-fg-2" } as const

/** 知乎栏目：到所选这周为止的 12 周里，每个栏目发了几篇、占比离计划差多少、平均每篇阅读多少 */
export function ReportColumns() {
  const week = useReportWeek((state) => state.week)
  const report = useMemo(() => weekReport(week), [week])
  const rows = useMemo(() => columnRows("zhihu-yiye", report.end), [report.end])

  return (
    <section
      id="columns"
      aria-labelledby="report-columns-title"
      className="overflow-hidden rounded-lg border border-line bg-card shadow-sm"
    >
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <LayoutGrid className="size-4 text-fg-2" aria-hidden />
        <h2 id="report-columns-title" className="text-sm font-medium">
          知乎栏目
        </h2>
        <span className="text-xs text-fg-2">到这周为止的 12 周</span>
      </div>

      <ul>
        {rows.map((row) => (
          <li
            key={row.column.id}
            data-report-column={row.column.id}
            className="flex min-h-10 min-w-0 items-center gap-2 border-b border-line px-3 last:border-b-0"
          >
            <ColorDot color={row.column.color} />
            <span className={cn("min-w-0 flex-1 truncate text-sm", NAME_TONE[row.works === 0 ? "empty" : "published"])}>
              {row.column.name}
            </span>
            <span className="text-xs text-fg-2 tabular">{row.works} 篇</span>
            {/* 进度条长度是实际占比，悬停可以看到和计划占比的对照 */}
            <ProgressMeter
              value={row.share}
              className="w-12"
              title={`实际 ${formatPercent(row.share)}，计划 ${formatPercent(row.targetShare)}`}
            />
            <span className="w-14 text-right text-xs tabular">{row.avgReads === null ? "—" : formatCount(row.avgReads)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ReportColumns
