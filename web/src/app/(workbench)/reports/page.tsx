import { ReportAccounts } from "@/features/reports/accounts"
import { ReportDigest } from "@/features/reports/digest"
import { ReportHistory } from "@/features/reports/history"
import { ReportNotes } from "@/features/reports/notes"
import { ReportWeekNav } from "@/features/reports/week-nav"
import { ReportWorks } from "@/features/reports/works"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="周报" actions={<ReportWeekNav />}>
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-3">
          <ReportDigest />
          <ReportAccounts />
          <ReportWorks />
          <ReportNotes />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap-card)">
          <ReportHistory />
        </div>
      </div>
    </PageFrame>
  )
}
