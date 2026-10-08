"use client"

import { formatWeekRange } from "@leafpress/core"
import { Sparkles } from "lucide-react"

import { LabelChip } from "@/components/base/label-chip"
import { useSelectedReport } from "./use-week-report"

export function ReportDigest() {
  const { week, weeks, report } = useSelectedReport()
  if (!report) return null
  return (
    <section id="digest" aria-labelledby="digest-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Sparkles className="size-4 text-fg-2" aria-hidden />
        <h2 id="digest-title" className="text-sm font-medium">
          小结
        </h2>
        <span className="text-xs text-fg-2 tabular">{formatWeekRange(week)}</span>
        {!report.complete && <LabelChip color="amber">本周还没过完</LabelChip>}
        {week === weeks[1] && <span className="ml-auto text-xs text-fg-2">上周数据</span>}
      </div>
      <ul className="flex flex-col gap-1 text-sm" data-digest>
        {report.digest.map((line) => (
          <li key={line} data-digest-line>
            {line}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ReportDigest
