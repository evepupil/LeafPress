"use client"

import { cn } from "cn"
import { Clock, Database } from "lucide-react"
import Link from "next/link"

import { accountHref, DATA_MODE_LABEL, PLATFORMS, formatRelative, setupView, type Account } from "@leafpress/core"
import { AccountTag } from "@/components/base/account-tag"
import { EmptyState } from "@/components/base/empty-state"
import { SourceBadge } from "@/components/base/source-badge"
import { RunResultIcon, Spinner } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { focusRing } from "@/lib/styles"
import { useNow } from "@/lib/local-clock"
import { useAccounts, usePulls, useSchedules } from "@/state/data"
import { dataPullWhen } from "@/state/schedules"
import { usePullNow } from "./use-pull-now"

function SourceRow({ account, schedule }: { account: Account; schedule?: string }) {
  const pulls = usePulls()
  const pull = pulls.find((item) => item.accountId === account.id)
  const source = setupView(account, PLATFORMS[account.platform], { pull, schedule }).source
  const { pulling, pull: retry } = usePullNow(account.id)
  const failed = source.status === "failed"

  return (
    <li data-source-row={account.id} data-source-status={source.status} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <AccountTag account={account} size="md" showPlatform />
        {failed && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            data-source-retry
            aria-busy={pulling}
            onClick={() => void retry()}
            disabled={pulling}
          >
            {pulling && <Spinner />}
            重试
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
        {/* 还没接时只留状态标记，不重复写「还没接」 */}
        {source.mode && (
          <span className="min-w-0 break-words">
            {DATA_MODE_LABEL[source.mode]}
            {source.provider && ` · ${source.provider}`}
          </span>
        )}
        {/* 什么时候拉：共享规则对没有拿数据工具的平台也会带上 schedule，但那种号根本不会被拉，不写 */}
        {source.schedule && source.status !== "missing" && (
          <span data-source-schedule className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {source.schedule}
          </span>
        )}
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
          <Link href={`${accountHref(account.id)}#setup`} className={cn("underline underline-offset-2 hover:text-fg", focusRing)}>
            看接入
          </Link>
        </p>
      )}
    </li>
  )
}

export function DataSources() {
  const accounts = useAccounts()
  const schedules = useSchedules()
  const schedule = schedules.find((item) => item.id === "data-pull")
  const when = dataPullWhen(schedules)
  const now = useNow()
  const scheduleTime = schedule?.lastRunAt && now ? formatRelative(schedule.lastRunAt, now) : undefined
  // 上次运行没有备注时不留悬空的「 · 」
  const lastRun = scheduleTime ? [scheduleTime, schedule?.lastNote].filter(Boolean).join(" · ") : "尚未运行"

  return (
    <section id="sources" aria-labelledby="sources-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Database className="size-4 text-fg-2" aria-hidden />
        <h2 id="sources-title" className="text-sm font-medium">
          数据来源
        </h2>
      </div>
      {schedule?.installed && (
        <div data-pull-schedule className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
          {schedule.lastResult ? <RunResultIcon result={schedule.lastResult} /> : <Clock className="size-3.5 text-fg-2" aria-hidden />}
          <span className="text-fg">
            {schedule.name} · {schedule.when}
          </span>
          <span className={schedule.lastResult === "failed" ? "text-bad" : "text-fg-2"}>{lastRun}</span>
        </div>
      )}
      <ul className="divide-y divide-line">
        {accounts.length === 0 ? (
          <li>
            <EmptyState icon={Database} title="还没有数据来源" />
          </li>
        ) : (
          accounts.map((account) => <SourceRow key={account.id} account={account} schedule={when} />)
        )}
      </ul>
    </section>
  )
}

export default DataSources
