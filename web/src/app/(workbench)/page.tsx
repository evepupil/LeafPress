import { TODAY } from "@/data/clock"
import { HomeAccounts } from "@/features/home/accounts-pulse"
import { HomeCadence } from "@/features/home/cadence"
import { HomeCapture } from "@/features/home/capture"
import { HomeInbox } from "@/features/home/inbox"
import { HomeMovers } from "@/features/home/movers"
import { HomeRuns } from "@/features/home/runs"
import { HomeSummaryBar } from "@/features/home/summary-bar"
import { PageFrame } from "@/features/shell/page-frame"
import { formatDay, weekdayLabel } from "@/lib/format"

export default function Page() {
  return (
    <PageFrame
      title="总览"
      meta={<span className="hidden truncate sm:inline">{`${formatDay(TODAY)} ${weekdayLabel(TODAY)}`}</span>}
      filterBar={<HomeSummaryBar />}
    >
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-2">
          <HomeInbox />
          <HomeCadence />
          <HomeMovers />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap-card)">
          <HomeAccounts />
          <HomeCapture />
          <HomeRuns />
        </div>
      </div>
    </PageFrame>
  )
}
