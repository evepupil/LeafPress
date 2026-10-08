import { LATEST_DAY } from "@/data/clock"
import { AccountBreakdown } from "@/features/data/breakdown"
import { DataSources } from "@/features/data/sources"
import { DataTrend } from "@/features/data/trend"
import { PullNowButton } from "@/features/data/pull-now"
import { TopWorks } from "@/features/data/top-works"
import { PageFrame } from "@/features/shell/page-frame"
import { formatDay } from "@/lib/format"

export default function Page() {
  return (
    <PageFrame
      title="数据"
      meta={<span className="hidden truncate sm:inline">{`截至 ${formatDay(LATEST_DAY)}`}</span>}
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
