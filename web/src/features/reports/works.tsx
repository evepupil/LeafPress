"use client"

import { PLATFORMS, formatCount, weekdayLabel } from "@leafpress/core"
import { cn } from "cn"
import { FileText } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/base/empty-state"
import { PlatformMark } from "@/components/base/marks"
import { focusRing } from "@/lib/styles"
import { useSelectedReport } from "./use-week-report"

const TITLE_LINK = cn("min-w-0 flex-1 truncate rounded-sm text-sm hover:underline", focusRing)

export function ReportWorks() {
  const { report } = useSelectedReport()
  if (!report) return null
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
