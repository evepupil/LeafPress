"use client"

import { formatCount, formatDay, metricsOf, metricText, progressText, waitingLabel, workflowById } from "@leafpress/core"
import { EmptyState } from "@/components/base/empty-state"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { WorkChip } from "@/components/base/work-chip"
import { useAccount, useToday, useWorks } from "@/state/data"

export function AccountWorks({ accountId }: { accountId: string }) {
  const account = useAccount(accountId)
  const works = useWorks().filter((work) => work.accountId === accountId && work.status === "done")
  const today = useToday()
  if (!account) return <EmptyState title="没有这个账号" />
  if (works.length === 0) return <EmptyState title="还没有已发布的作品" />

  const primaryMetric = metricsOf(account.platform)[0]
  return (
    <section id="works" aria-labelledby="works-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <h2 id="works-title" className="text-sm font-medium">
          已发布作品
        </h2>
        <span className="text-sm text-fg-2 tabular">{works.length}</span>
        <a href={`/?platform=${account.platform}`} className="ml-auto text-xs text-fg-2 hover:text-fg">
          全部作品 →
        </a>
      </div>
      <ul className="divide-y divide-line">
        {works.map((work) => {
          const workflow = workflowById(work.workflowId)
          const progress = workflow ? progressText(work, workflow) : "工作流不存在"
          const waiting = workflow && work.status === "waiting" ? waitingLabel(work, workflow) : undefined
          const metricValue = primaryMetric ? work.totals?.[primaryMetric.key] : undefined
          return (
            <li key={work.id} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5" data-account-work={work.id}>
              <div className="flex min-w-0 items-start gap-2">
                <WorkStatusIcon status={work.status} />
                <div className="min-w-0 flex-1">
                  <WorkChip work={work} className="text-sm" />
                  <p className="truncate text-xs text-fg-2">
                    {work.publishedAt ? formatDay(work.publishedAt, today) : "已完成"} · {progress}
                  </p>
                  {waiting && <p className="truncate text-xs text-warn">{waiting}</p>}
                </div>
                {primaryMetric && (
                  <span className="shrink-0 text-xs text-fg-2 tabular">{metricText(work, account.platform, primaryMetric.key)}</span>
                )}
              </div>
              {metricValue !== undefined && (
                <p className="pl-6 text-xs text-fg-2">
                  {primaryMetric?.label} {formatCount(metricValue)}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default AccountWorks
