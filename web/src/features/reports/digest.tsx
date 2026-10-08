"use client"

import { Lightbulb, Sparkles } from "lucide-react"
import { useMemo } from "react"

import { LabelChip } from "@/components/base/label-chip"
import { LAST_WEEK } from "@/data/clock"
import { formatWeekRange } from "@/lib/format"
import { weekReport } from "@/lib/report"
import { useReportWeek } from "@/state/report-week"

/**
 * 小结与建议：本页最重要的一块。
 * 句子全部由 weekReport 现成算好（发了几篇、粉丝、阅读、断更，以及下一步建议），
 * 这里只负责按周展示，不自己拼文字；跟着共享的周一起变。
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

      {/* 没有建议时整节不出现 */}
      {report.suggestions.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <h3 className="pb-1.5 text-xs font-medium text-fg-2">建议</h3>
          <ul className="flex flex-col gap-1.5" data-suggestions>
            {report.suggestions.map((line) => (
              <li key={line} className="flex gap-2 text-sm">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default ReportDigest
