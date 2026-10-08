"use client"

import { addDays, formatWeekRange, weekStartOf } from "@leafpress/core"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { useSelectedReport } from "./use-week-report"

export function ReportWeekNav() {
  const { week, setWeek, weeks, today } = useSelectedReport()
  const index = weeks.indexOf(week)
  const previous = weeks[index + 1]
  const next = weeks[index - 1]
  const thisWeek = weekStartOf(today)
  const lastWeek = weekStartOf(addDays(today, -7))
  const hasLastWeek = weeks.includes(lastWeek)
  const label = week === thisWeek ? "（本周还没过完）" : week === lastWeek ? "（上周）" : ""
  return (
    <div className="flex items-center gap-1">
      <span className="min-w-0 truncate whitespace-nowrap text-xs text-fg-2 tabular" data-week-label title={formatWeekRange(week)}>
        {formatWeekRange(week)}
        {label}
      </span>
      <IconButton label="上一周" data-week-prev disabled={!previous} onClick={() => previous && setWeek(previous)}>
        <ChevronLeft />
      </IconButton>
      <IconButton label="下一周" data-week-next disabled={!next} onClick={() => next && setWeek(next)}>
        <ChevronRight />
      </IconButton>
      {hasLastWeek && (
        <Button variant="ghost" size="sm" data-week-last onClick={() => setWeek(lastWeek)}>
          上周
        </Button>
      )}
    </div>
  )
}

export default ReportWeekNav
