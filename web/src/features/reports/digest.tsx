"use client"

import { Sparkles } from "lucide-react"
import { useMemo } from "react"

import { LabelChip } from "@/components/base/label-chip"
import { LAST_WEEK } from "@/data/clock"
import { formatWeekRange } from "@/lib/format"
import { weekReport } from "@/lib/report"
import { useReportWeek } from "@/state/report-week"

/**
 * 小结：本页最重要的一块。只放客观的几句（发了几篇、粉丝、浏览、断更），不设目标、不给建议，要分析让 AI 拉数据自己分析。
 * 句子全部由 weekReport 现成算好，这里只负责按周展示，不自己拼文字；跟着共享的周一起变。
 */
export function ReportDigest() {
  const week = useReportWeek((state) => state.week)
  const report = useMemo(() => weekReport(week), [week])

  return (
    <section id="digest" aria-labelledby="digest-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Sparkles className="size-4 text-fg-2" aria-hidden />
        <h2 id="digest-title" className="text-sm font-medium">
          小结
        </h2>
        <span className="text-xs text-fg-2 tabular">{formatWeekRange(week)}</span>
        {!report.complete && <LabelChip color="amber">本周还没过完</LabelChip>}
        {week === LAST_WEEK && <span className="ml-auto text-xs text-fg-2">周一 08:00 生成</span>}
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
