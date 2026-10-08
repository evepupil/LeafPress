"use client"

import { PLATFORMS, STAGE_LABEL } from "@leafpress/core"
import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { EmptyState } from "@/components/base/empty-state"
import { PlatformMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { AccountHeader } from "@/features/account-detail/header"
import { AccountProfile } from "@/features/account-detail/profile"
import { AccountSetup } from "@/features/account-detail/setup"
import { AccountTrend } from "@/features/account-detail/trend"
import { AccountWorks } from "@/features/account-detail/works"
import { PageFrame } from "@/features/shell/page-frame"
import { useAccount } from "@/state/data"

function AccountContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id") ?? ""
  const account = useAccount(id)

  if (!account) {
    return (
      <PageFrame title="账号">
        <div className="p-3">
          <EmptyState
            title={id ? "没有这个账号" : "缺少账号编号"}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/accounts/">返回账号</Link>
              </Button>
            }
          />
        </div>
      </PageFrame>
    )
  }

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
        account.url ? (
          <Button variant="outline" size="sm" asChild>
            <a href={account.url} target="_blank" rel="noreferrer">
              <ExternalLink />
              打开主页
            </a>
          </Button>
        ) : undefined
      }
    >
      <div data-account-detail={id} className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-2">
          <AccountHeader accountId={id} />
          <AccountProfile accountId={id} />
          <AccountTrend accountId={id} />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap-card)">
          <AccountSetup accountId={id} />
          <AccountWorks accountId={id} />
        </div>
      </div>
    </PageFrame>
  )
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <PageFrame title="账号">
          <EmptyState title="正在读取账号" />
        </PageFrame>
      }
    >
      <AccountContent />
    </Suspense>
  )
}
