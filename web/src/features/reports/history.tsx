"use client"

import { cn } from "cn"
import { History, NotebookPen } from "lucide-react"
import { useMemo } from "react"

import { BoardColumn } from "@/components/base/board"
import { LabelChip } from "@/components/base/label-chip"
import { THIS_WEEK } from "@/data/clock"
import { formatCount, formatSigned, formatWeekRange } from "@/lib/format"
import { REPORT_WEEKS, weekReport } from "@/lib/report"
import { focusRing } from "@/lib/styles"
import { useReportWeek } from "@/state/report-week"

const CARD_BASE =
  "flex w-full min-w-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left shadow-sm transition-[border-color] duration-(--dur-fast)"

/** 选中的那周底色变深、边框加重；其余是白卡，悬停时边框加重 */
const CARD_TONE = {
  selected: "border-line-3 bg-selected",
  idle: "border-line bg-card hover:border-line-3",
} as const

/**
 * 往期：本周和之前 8 周各一张卡，新的在前，点哪张整页就切到哪一周。
 * 9 周的周报只在第一次显示时算一遍，之后切换周不再重算。
 */
export function ReportHistory() {
  const week = useReportWeek((state) => state.week)
  const setWeek = useReportWeek((state) => state.setWeek)
  const reports = useMemo(() => REPORT_WEEKS.map((weekStart) => weekReport(weekStart)), [])

  return (
    <div id="history" className="min-w-0">
      <BoardColumn icon={<History className="size-4 text-fg-2" aria-hidden />} title="往期" count={REPORT_WEEKS.length}>
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
                {report.week === THIS_WEEK && <LabelChip>本周</LabelChip>}
                {report.note && <NotebookPen className="ml-auto size-3.5 text-fg-3" role="img" aria-label="已复盘" />}
              </span>
              <span className="flex items-center gap-2 text-xs text-fg-2 tabular">
                <span>发布 {report.totals.posts}</span>
                <span aria-hidden>·</span>
                <span>粉丝 {formatSigned(report.totals.delta)}</span>
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
