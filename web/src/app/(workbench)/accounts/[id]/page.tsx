import { ExternalLink } from "lucide-react"
import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import { STAGE_LABEL } from "@/data/labels"
import { PlatformMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { AccountHeader } from "@/features/account-detail/header"
import { AccountSource } from "@/features/account-detail/source"
import { AccountTrend } from "@/features/account-detail/trend"
import { AccountWorks } from "@/features/account-detail/works"
import { ColumnTable } from "@/features/account-detail/columns"
import { DirectionCard } from "@/features/account-detail/direction"
import { PageFrame } from "@/features/shell/page-frame"

export const dynamicParams = false

export function generateStaticParams() {
  return ACCOUNTS.map((account) => ({ id: account.id }))
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = accountById(id)
  return (
    <PageFrame
      title={account.name}
      meta={
        <span className="flex items-center gap-1.5">
          <PlatformMark platform={account.platform} size={14} />
          <span className="hidden sm:inline">{`${PLATFORMS[account.platform].name} · ${STAGE_LABEL[account.stage]}`}</span>
        </span>
      }
      actions={
        <Button variant="outline" size="sm" asChild>
          <a href={account.url} target="_blank" rel="noreferrer">
            <ExternalLink />
            打开主页
          </a>
        </Button>
      }
    >
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-2">
          <AccountHeader accountId={id} />
          <DirectionCard accountId={id} />
          <AccountTrend accountId={id} />
          <ColumnTable accountId={id} />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap-card)">
          <AccountSource accountId={id} />
          <AccountWorks accountId={id} />
        </div>
      </div>
    </PageFrame>
  )
}
