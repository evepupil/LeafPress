"use client"

import { formatDay } from "@leafpress/core"

import { AccountBreakdown } from "@/features/data/breakdown"
import { DataSources } from "@/features/data/sources"
import { DataTrend } from "@/features/data/trend"
import { PullNowButton } from "@/features/data/pull-now"
import { TopWorks } from "@/features/data/top-works"
import { PageFrame } from "@/features/shell/page-frame"
import { useData, useToday } from "@/state/data"

export default function Page() {
  const latestDay = useData((state) => state.dataset?.latestDay)
  const today = useToday()
  return (
    <PageFrame
      title="数据"
      meta={<span className="hidden truncate sm:inline">{latestDay ? `截至 ${formatDay(latestDay, today)}` : "暂无数据"}</span>}
      actions={<PullNowButton />}
    >
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <DataTrend />
        <div className="grid items-start gap-(--gap-card) xl:grid-cols-2">
          <div className="min-w-0">
            <AccountBreakdown />
          </div>
          <div className="min-w-0">
            <DataSources />
          </div>
        </div>
        <TopWorks />
      </div>
    </PageFrame>
  )
}
