"use client"

import { formatCount, formatSigned, formatWeekRange, weekReport } from "@leafpress/core"
import { cn } from "cn"
import { History, NotebookPen } from "lucide-react"
import { useMemo } from "react"

import { BoardColumn } from "@/components/base/board"
import { LabelChip } from "@/components/base/label-chip"
import { focusRing } from "@/lib/styles"
import { useSelectedReport } from "./use-week-report"

const CARD_BASE =
  "flex w-full min-w-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left shadow-sm transition-[border-color] duration-(--dur-fast)"
const CARD_TONE = { selected: "border-line-3 bg-selected", idle: "border-line bg-card hover:border-line-3" } as const

export function ReportHistory() {
  const { week, setWeek, weeks, metrics, notes } = useSelectedReport()
  const reports = useMemo(
    () => (metrics ? weeks.map((weekStart) => weekReport({ ...metrics, notes }, weekStart)) : []),
    [metrics, notes, weeks],
  )
  return (
    <div id="history" className="min-w-0">
      <BoardColumn icon={<History className="size-4 text-fg-2" aria-hidden />} title="往期" count={weeks.length}>
        {reports.map((report) => {
          const selected = report.week === week
          return (
            <button
              key={report.week}
              type="button"
              data-history-week={report.week}
              aria-current={selected ? "true" : undefined}
              onClick={() => setWeek(report.week)}
              className={cn(CARD_BASE, focusRing, CARD_TONE[selected ? "selected" : "idle"])}
            >
              <span className="flex items-center gap-1.5">
                <span className="text-sm tabular">{formatWeekRange(report.week)}</span>
                {report.week === weeks[0] && <LabelChip>本周</LabelChip>}
                {report.note && <NotebookPen className="ml-auto size-3.5 text-fg-3" role="img" aria-label="已复盘" />}
              </span>
              <span className="flex items-center gap-2 text-xs text-fg-2 tabular">
                <span>发布 {report.totals.posts}</span>
                <span aria-hidden>·</span>
                <span>粉丝 {report.totals.delta === null ? "—" : formatSigned(report.totals.delta)}</span>
                <span aria-hidden>·</span>
                <span>浏览 {formatCount(report.totals.reads)}</span>
              </span>
            </button>
          )
        })}
      </BoardColumn>
    </div>
  )
}

export default ReportHistory
