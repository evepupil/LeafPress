"use client"

import { formatWeekRange } from "@leafpress/core"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { useSelectedReport } from "./use-week-report"

export function ReportWeekNav() {
  const { week, setWeek, weeks } = useSelectedReport()
  const index = weeks.indexOf(week)
  const previous = weeks[index + 1]
  const next = weeks[index - 1]
  const current = weeks[0]
  const last = weeks[1]
  return (
    <div className="flex items-center gap-1">
      <span className="hidden text-xs text-fg-2 tabular sm:inline" data-week-label>
        {formatWeekRange(week)}
        {week === current ? "（本周）" : ""}
      </span>
      <IconButton label="上一周" data-week-prev disabled={!previous} onClick={() => previous && setWeek(previous)}>
        <ChevronLeft />
      </IconButton>
      <IconButton label="下一周" data-week-next disabled={!next} onClick={() => next && setWeek(next)}>
        <ChevronRight />
      </IconButton>
      {last && (
        <Button variant="ghost" size="sm" data-week-last onClick={() => setWeek(last)}>
          上周
        </Button>
      )}
    </div>
  )
}

export default ReportWeekNav
