"use client"

import { cn } from "cn"
import { FileText } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { PlatformMark } from "@/components/base/marks"
import { PLATFORMS } from "@/data/accounts"
import { formatCount, weekdayLabel } from "@/lib/format"
import { weekReport } from "@/lib/report"
import { focusRing } from "@/lib/styles"
import { useReportWeek } from "@/state/report-week"

const TITLE_LINK = cn("min-w-0 flex-1 truncate rounded-sm text-sm hover:underline", focusRing)

/** 这周发的：这一周里真正发出去的作品，按发布日从早到晚，右边是它目前累计的阅读 */
export function ReportWorks() {
  const week = useReportWeek((state) => state.week)
  const report = useMemo(() => weekReport(week), [week])
  const { published } = report

  return (
    <section id="works" aria-labelledby="report-works-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <FileText className="size-4 text-fg-2" aria-hidden />
        <h2 id="report-works-title" className="text-sm font-medium">
          这周发的
        </h2>
        <span className="text-sm text-fg-2 tabular">{published.length}</span>
      </div>

      {published.length === 0 ? (
        <EmptyState icon={FileText} title="这周没有发布" />
      ) : (
        <ul>
          {published.map((item) => (
            <li
              key={item.work.id}
              data-report-work={item.work.id}
              className="flex min-h-11 min-w-0 items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0"
            >
              {/* 平台标识和平台名挨在一起，当作一个整体 */}
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <PlatformMark platform={item.account.platform} size={14} />
                <span className="shrink-0 text-xs text-fg-2">{PLATFORMS[item.account.platform].name}</span>
              </span>
              <Link href={`/?open=${item.work.id}`} title={item.work.title} className={TITLE_LINK}>
                {item.work.title}
              </Link>
              <span className="shrink-0 text-xs text-fg-2">{item.work.publishedAt ? weekdayLabel(item.work.publishedAt) : "—"}</span>
              <span className="w-14 shrink-0 text-right text-xs tabular">{formatCount(item.reach)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ReportWorks
