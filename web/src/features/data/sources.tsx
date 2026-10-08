"use client"

import { cn } from "cn"
import { Clock, Database } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { SourceBadge } from "@/components/base/source-badge"
import { RunResultIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { ACCOUNTS } from "@/data/accounts"
import { DATA_MODE_LABEL } from "@/data/labels"
import type { Account } from "@/data/types"
import { formatRelative } from "@/lib/format"
import { effectiveSource } from "@/lib/setup"
import { focusRing } from "@/lib/styles"
import { pullNow } from "@/state/actions"
import { useAccounts } from "@/state/accounts"
import { useSchedules } from "@/state/schedules"

function SourceRow({ account }: { account: Account }) {
  const pull = useAccounts((state) => state.pulls[account.id])
  const source = effectiveSource(account, pull)
  const failed = source.status === "failed"

  const retry = () => {
    const result = pullNow([account.id])
    if (result.ok) toast.success(result.note)
    else toast(result.note)
  }

  return (
    <li data-source-row={account.id} data-source-status={source.status} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <AccountTag account={account} size="md" showPlatform />
        {failed && (
          <Button variant="outline" size="sm" className="ml-auto" data-source-retry onClick={retry}>
            重试
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
        <span className="min-w-0 break-words">
          {DATA_MODE_LABEL[source.mode]} · {source.provider}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" aria-hidden />
          {source.schedule}
        </span>
        <SourceBadge source={source} />
      </div>
      {failed && (
        <p className="text-xs text-bad">
          {source.failReason}
          {source.fixHint && <span className="text-fg-2">。{source.fixHint}</span>}
        </p>
      )}
      {source.status === "missing" && (
        <p className="text-xs text-fg-2">
          {source.plan}。
          <Link href={`/accounts/${account.id}/#setup`} className={cn("underline underline-offset-2 hover:text-fg", focusRing)}>
            看接入
          </Link>
        </p>
      )}
    </li>
  )
}

/**
 * 数据来源：最上面是定时的「拉作品数据」上次跑得怎么样；下面每个号的数据从哪来、什么时候拉、拉得怎么样。
 * 数据都靠工具拉，没有手填；拉取失败的号可以重试，要配的东西去账号的「接入」里填。
 */
export function DataSources() {
  // 定时工作流「拉作品数据」最近一次运行；视图栏的「现在拉一次」跑完会改它，这一行的时间跟着变成「刚刚」
  const pullRun = useSchedules((state) => state.runs["data-pull"])

  return (
    <section id="sources" aria-labelledby="sources-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Database className="size-4 text-fg-2" aria-hidden />
        <h2 id="sources-title" className="text-sm font-medium">
          数据来源
        </h2>
      </div>
      <div data-pull-schedule className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
        <RunResultIcon result={pullRun.lastResult} />
        <span className="text-fg">拉作品数据 · 每天 06:00</span>
        <span className={pullRun.lastResult === "failed" ? "text-bad" : "text-fg-2"}>
          {formatRelative(pullRun.lastRunAt)} · {pullRun.lastNote}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {ACCOUNTS.map((account) => (
          <SourceRow key={account.id} account={account} />
        ))}
      </ul>
    </section>
  )
}

export default DataSources
