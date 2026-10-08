"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { LAST_WEEK, THIS_WEEK, addDays } from "@/data/clock"
import { formatWeekRange } from "@/lib/format"
import { REPORT_WEEKS } from "@/lib/report"
import { useReportWeek } from "@/state/report-week"

/**
 * 视图栏右侧的周切换。
 * 能看的周固定为 REPORT_WEEKS（本周和之前 8 周，新的在前）：
 * 最新一周不能再往后，最老一周不能再往前，到头的方向按钮禁用。
 */
export function ReportWeekNav() {
  const week = useReportWeek((state) => state.week)
  const setWeek = useReportWeek((state) => state.setWeek)
  const oldestWeek = REPORT_WEEKS[REPORT_WEEKS.length - 1]

  return (
    <div className="flex items-center gap-1">
      <span className="hidden text-xs text-fg-2 tabular sm:inline" data-week-label>
        {formatWeekRange(week)}
        {week === THIS_WEEK ? "（本周）" : ""}
      </span>
      <IconButton label="上一周" data-week-prev disabled={week === oldestWeek} onClick={() => setWeek(addDays(week, -7))}>
        <ChevronLeft />
      </IconButton>
      <IconButton label="下一周" data-week-next disabled={week === THIS_WEEK} onClick={() => setWeek(addDays(week, 7))}>
        <ChevronRight />
      </IconButton>
      <Button variant="ghost" size="sm" data-week-last onClick={() => setWeek(LAST_WEEK)}>
        上周
      </Button>
    </div>
  )
}

export default ReportWeekNav
