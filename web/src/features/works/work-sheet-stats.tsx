"use client"

import { formatDay, formatSigned, metricText, metricsOf, rankedWork, type Work } from "@leafpress/core"

import { SheetSection } from "./work-sheet-parts"
import { useMetricsInput, useToday } from "@/state/data"

export function WorkSheetStats({ work }: { work: Work }) {
  const input = useMetricsInput()
  const today = useToday()
  const account = input?.accounts.find((item) => item.id === work.accountId)
  if (!account || !input) return null
  const metrics = metricsOf(account.platform)
  const rank = rankedWork(input.dataset, work, account)
  return (
    <SheetSection
      title="数据"
      aside={<span className="text-xs text-fg-2">{`截至 ${formatDay(input.dataset.latestDay, today)}`}</span>}
      data-work-stats
    >
      {work.totals ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {metrics.map((metric) => (
              <div key={metric.key} data-work-metric={metric.key} className="min-w-0 rounded-md bg-raised px-2.5 py-2">
                <p className="truncate text-xs text-fg-2">{metric.label}</p>
                <p className="truncate text-sm font-medium tabular">{metricText(work, account.platform, metric.key)}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-2 tabular">{`近 7 天${metrics[0]?.label ?? "数据"} ${formatSigned(rank.growth)}`}</p>
        </>
      ) : (
        <p className="text-sm text-fg-2">还没有数据</p>
      )}
    </SheetSection>
  )
}
