import { ACCOUNTS } from "@/data/accounts"
import { AccountsGrid } from "@/features/accounts/accounts-grid"
import { SetupTable } from "@/features/accounts/setup-table"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="账号" meta={<span className="tabular">{ACCOUNTS.length}</span>}>
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <AccountsGrid />
        <SetupTable />
      </div>
    </PageFrame>
  )
}
