"use client"

import {
  formatCount,
  formatDay,
  metricsOf,
  metricText,
  progressText,
  waitingLabel,
  WORK_STATUS_LABEL,
  workflowById,
  workHref,
} from "@leafpress/core"
import Link from "next/link"

import { EmptyState } from "@/components/base/empty-state"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { useNow } from "@/lib/local-clock"
import { useAccount, useToday, useWorks } from "@/state/data"
import { AgentLeaseStatus } from "../works/agent-lease"
import { ACCOUNT_WORK_PREVIEW_LIMIT, previewAccountWorks } from "./works-order"

export function AccountWorks({ accountId }: { accountId: string }) {
  const account = useAccount(accountId)
  const preview = previewAccountWorks(useWorks(), accountId)
  const today = useToday()
  const now = useNow()
  if (!account) return <EmptyState title="没有这个账号" />
  if (preview.total === 0) return <EmptyState title="还没有作品" />

  const primaryMetric = metricsOf(account.platform)[0]
  return (
    <section id="works" aria-labelledby="works-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <h2 id="works-title" className="text-sm font-medium">
          作品
        </h2>
        <span className="text-sm text-fg-2 tabular" data-account-work-count>
          {preview.total}
        </span>
        <Link href={`/?account=${encodeURIComponent(account.id)}`} className="ml-auto text-xs text-fg-2 hover:text-fg">
          全部作品 →
        </Link>
      </div>
      <ul className="divide-y divide-line">
        {preview.items.map((work) => {
          const workflow = workflowById(work.workflowId)
          const progress = workflow ? progressText(work, workflow) : "工作流不存在"
          const waiting = workflow && work.status === "waiting" ? waitingLabel(work, workflow) : undefined
          const metricValue = primaryMetric ? work.totals?.[primaryMetric.key] : undefined
          const headline = work.status === "done" && work.publishedAt ? formatDay(work.publishedAt, today) : WORK_STATUS_LABEL[work.status]
          return (
            <li
              key={work.id}
              className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5"
              data-account-work={work.id}
              data-work-status={work.status}
            >
              <div className="flex min-w-0 items-start gap-2">
                <WorkStatusIcon status={work.status} />
                <div className="min-w-0 flex-1">
                  {/* 账号页里平台都一样，这里只写作品标题，点开就是作品详情 */}
                  <Link
                    href={workHref(work.id)}
                    className="block truncate text-sm hover:underline"
                    title={work.title}
                    data-account-work-title
                  >
                    {work.title}
                  </Link>
                  <p className="truncate text-xs text-fg-2" title={`${headline} · ${progress}`}>
                    {headline} · {progress}
                  </p>
                  {waiting && <p className="truncate text-xs text-warn">{waiting}</p>}
                  {work.error && (
                    <p data-work-error className="line-clamp-2 text-xs text-bad">
                      {work.error}
                    </p>
                  )}
                  {work.status === "doing" && now && <AgentLeaseStatus work={work} now={now} />}
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
      {preview.total > ACCOUNT_WORK_PREVIEW_LIMIT && (
        <p className="border-t border-line px-3 py-2 text-xs text-fg-2">
          <Link href={`/?account=${encodeURIComponent(account.id)}`} className="hover:text-fg">
            还有 {preview.total - preview.items.length} 条
          </Link>
        </p>
      )}
    </section>
  )
}

export default AccountWorks
