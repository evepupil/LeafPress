"use client"

import { cn } from "cn"
import { Clock, Database } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { accountHref, DATA_MODE_LABEL, PLATFORMS, PULL_STATUS_LABEL, formatRelative, setupView, type Account } from "@leafpress/core"
import { AccountTag } from "@/components/base/account-tag"
import { EmptyState } from "@/components/base/empty-state"
import { SourceBadge } from "@/components/base/source-badge"
import { RunResultIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { focusRing } from "@/lib/styles"
import { pullNow } from "@/state/actions/data"
import { useData, useAccounts, usePulls, useSchedules } from "@/state/data"

function SourceRow({ account, schedule }: { account: Account; schedule?: string }) {
  const pulls = usePulls()
  const pull = pulls.find((item) => item.accountId === account.id)
  const source = setupView(account, PLATFORMS[account.platform], { pull, schedule }).source
  const missingCapabilities = [PLATFORMS[account.platform].audienceLabel, ...PLATFORMS[account.platform].metrics.map((item) => item.label)]
  const [retrying, setRetrying] = useState(false)
  const failed = source.status === "failed"

  const retry = async () => {
    setRetrying(true)
    try {
      const result = await pullNow([account.id])
      toast(result.note)
    } catch (error) {
      toast(error instanceof Error ? error.message : "拉取失败")
    } finally {
      setRetrying(false)
    }
  }

  return (
    <li data-source-row={account.id} data-source-status={source.status} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <AccountTag account={account} size="md" showPlatform />
        {failed && (
          <Button variant="outline" size="sm" className="ml-auto" data-source-retry onClick={() => void retry()} disabled={retrying}>
            重试
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
        <span className="min-w-0 break-words">
          {source.mode ? DATA_MODE_LABEL[source.mode] : PULL_STATUS_LABEL.missing}
          {source.provider && ` · ${source.provider}`}
        </span>
        {source.schedule && (
          <span className="inline-flex items-center gap-1">
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
          {`缺少数据获取工具，暂时无法获取${missingCapabilities.join("、")}。`}
          <Link href={`${accountHref(account.id)}#setup`} className={cn("ml-1 underline underline-offset-2 hover:text-fg", focusRing)}>
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
  const now = useData((state) => state.boot?.now)
  const scheduleTime = schedule?.lastRunAt && now ? formatRelative(schedule.lastRunAt, now) : undefined

  return (
    <section id="sources" aria-labelledby="sources-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Database className="size-4 text-fg-2" aria-hidden />
        <h2 id="sources-title" className="text-sm font-medium">
          数据来源
        </h2>
      </div>
      <div data-pull-schedule className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
        {schedule?.lastResult ? <RunResultIcon result={schedule.lastResult} /> : <Clock className="size-3.5 text-fg-2" aria-hidden />}
        <span className="text-fg">
          {schedule?.name ?? "拉作品数据"} · {schedule?.when ?? "未安排"}
        </span>
        <span className={schedule?.lastResult === "failed" ? "text-bad" : "text-fg-2"}>
          {scheduleTime ? `${scheduleTime} · ${schedule?.lastNote ?? ""}` : schedule?.installed ? "尚未运行" : "未安装"}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {accounts.length === 0 ? (
          <li>
            <EmptyState icon={Database} title="还没有数据来源" />
          </li>
        ) : (
          accounts.map((account) => <SourceRow key={account.id} account={account} schedule={schedule?.when} />)
        )}
      </ul>
    </section>
  )
}

export default DataSources
