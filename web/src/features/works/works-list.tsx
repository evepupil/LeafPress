"use client"

import {
  formatRelative,
  metricsOf,
  metricText,
  progressText,
  workflowById,
  WORK_STATUS_LABEL,
  type Account,
  type Work,
  type WorkStatus,
} from "@leafpress/core"
import { cn } from "cn"
import { FileText } from "lucide-react"
import { useMemo, useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { EmptyState } from "@/components/base/empty-state"
import { Spinner, WorkStatusIcon } from "@/components/base/state-icons"
import { useData } from "@/state/data"
import { focusRingInset } from "@/lib/styles"
import { AgentLeaseStatus } from "./agent-lease"
import { DONE_PAGE_SIZE, moreCount, workColumns } from "./works-model"

const COLUMNS: { label: string; className: string }[] = [
  { label: "标题", className: "text-left" },
  { label: "账号", className: "w-[150px] text-left" },
  { label: "工作流", className: "w-[120px] text-left" },
  { label: "进度", className: "w-[180px] text-left" },
  { label: "更新", className: "w-[96px] text-left" },
  { label: "浏览", className: "w-[72px] text-right" },
]

function WorkRow({ work, account, now, onOpen }: { work: Work; account: Account | undefined; now?: string; onOpen: (id: string) => void }) {
  const running = Boolean(work.lease && now && Date.parse(work.lease.expiresAt) > Date.parse(now))
  const workflow = workflowById(work.workflowId)
  const open = () => onOpen(work.id)
  if (!account) return null
  const primary = metricsOf(account.platform)[0]
  return (
    <tr
      data-work-row={work.id}
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          open()
        }
      }}
      className={cn("h-9 cursor-pointer border-t border-line transition-colors duration-(--dur-fast) hover:bg-hover", focusRingInset)}
    >
      <td className="px-3">
        <div className="flex min-w-0 items-center gap-2">
          <WorkStatusIcon status={work.status} />
          <span className="truncate text-sm text-fg" title={work.title}>
            {work.title}
          </span>
        </div>
      </td>
      <td className="px-3">
        <AccountTag account={account} />
      </td>
      <td className="px-3">
        <span className="block truncate text-xs text-fg-2">{workflow?.name ?? work.workflowId}</span>
      </td>
      <td className="px-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {running && <Spinner />}
            <span className={cn("truncate text-xs", work.status === "waiting" ? "text-warn" : "text-fg-2")}>
              {workflow ? progressText(work, workflow) : WORK_STATUS_LABEL[work.status]}
            </span>
          </div>
          {work.status === "doing" && <AgentLeaseStatus work={work} now={now} />}
        </div>
      </td>
      <td className="px-3 text-xs text-fg-2 tabular">{formatRelative(work.updatedAt, now ?? work.updatedAt)}</td>
      <td className="px-3 text-right text-xs text-fg-2 tabular">{primary ? metricText(work, account.platform, primary.key) : "—"}</td>
    </tr>
  )
}

function Group({
  status,
  items,
  accounts,
  now,
  limit,
  onShowMore,
  onOpen,
}: {
  status: WorkStatus
  items: Work[]
  accounts: Account[]
  now?: string
  limit: number
  onShowMore: () => void
  onOpen: (id: string) => void
}) {
  const shown = status === "done" ? items.slice(0, limit) : items
  return (
    <>
      <tr data-list-group={status} className="h-8 border-t border-line bg-raised">
        <th colSpan={COLUMNS.length} scope="colgroup" className="px-3 text-left font-normal">
          <span className="flex items-center gap-2">
            <WorkStatusIcon status={status} />
            <span className="text-sm font-medium text-fg">{WORK_STATUS_LABEL[status]}</span>
            <span className="text-sm text-fg-2 tabular">{items.length}</span>
          </span>
        </th>
      </tr>
      {shown.map((work) => (
        <WorkRow key={work.id} work={work} account={accounts.find((item) => item.id === work.accountId)} now={now} onOpen={onOpen} />
      ))}
      {shown.length < items.length && (
        <tr className="h-9 border-t border-line">
          <td colSpan={COLUMNS.length} className="px-3">
            <button
              type="button"
              data-show-more
              onClick={onShowMore}
              className={cn("h-7 rounded-md px-2 text-sm text-fg-2 hover:bg-hover hover:text-fg", focusRingInset)}
            >
              再显示 <span className="tabular">{moreCount(items.length, shown.length)}</span> 个
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

export function WorksList({ works, status, onOpen }: { works: Work[]; status: WorkStatus | null; onOpen: (id: string) => void }) {
  const groups = useMemo(() => workColumns(works, status), [works, status])
  const [limit, setLimit] = useState(DONE_PAGE_SIZE)
  const accounts = useData((state) => state.boot?.accounts ?? [])
  const now = useData((state) => state.boot?.now)
  if (groups.every((group) => group.items.length === 0)) return <EmptyState icon={FileText} title="没有符合条件的作品" className="py-16" />
  return (
    <div className="p-3 pb-20 lg:pb-3">
      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <thead>
              <tr className="h-8 bg-raised text-xs text-fg-2">
                {COLUMNS.map((column) => (
                  <th key={column.label} scope="col" className={cn("px-3 font-normal", column.className)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Group
                  key={group.status}
                  status={group.status}
                  items={group.items}
                  accounts={accounts}
                  now={now}
                  limit={limit}
                  onShowMore={() => setLimit((current) => current + DONE_PAGE_SIZE)}
                  onOpen={onOpen}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
