"use client"

import { cn } from "cn"
import { Plug } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { EmptyState } from "@/components/base/empty-state"
import { SourceBadge } from "@/components/base/source-badge"
import { WorkflowStatusIcon } from "@/components/base/state-icons"
import {
  DATA_MODE_LABEL,
  PLATFORMS,
  PULL_STATUS_LABEL,
  SETUP_STATE_LABEL,
  accountHref,
  setupView,
  type Account,
  type SetupState,
} from "@leafpress/core"
import { focusRing } from "@/lib/styles"
import { useAccounts, usePulls, useSchedules } from "@/state/data"

const STATE_TEXT: Record<SetupState, string> = {
  ready: "text-good",
  broken: "text-bad",
  unfinished: "text-warn",
}

const COLUMNS = [
  { label: "账号", width: "w-[170px]" },
  { label: "作品产出", width: "w-[26%]" },
  { label: "数据获取", width: "w-[22%]" },
  { label: "能拿到", width: "w-[22%]" },
  { label: "还缺什么", width: "w-[30%]" },
]

function SetupRow({ account, schedule }: { account: Account; schedule?: string }) {
  const pulls = usePulls()
  const pull = pulls.find((item) => item.accountId === account.id)
  const view = setupView(account, PLATFORMS[account.platform], { pull, schedule })
  return (
    <tr data-setup-row={account.id} className="border-t border-line align-top">
      <td className="px-3 py-2.5">
        <Link href={`${accountHref(account.id)}#setup`} className={cn("block min-w-0", focusRing)}>
          <AccountTag account={account} size="md" showPlatform />
        </Link>
        <p className={cn("mt-1 text-xs", STATE_TEXT[view.state])} data-setup-state={view.state}>
          {SETUP_STATE_LABEL[view.state]}
        </p>
      </td>
      <td className="px-3 py-2.5">
        <ul className="flex flex-col gap-1">
          {view.workflows.map((workflow) => {
            const usable = view.usableWorkflows.some((item) => item.id === workflow.id)
            return (
              <li key={workflow.id} className="flex min-w-0 items-center gap-1.5 text-sm">
                <WorkflowStatusIcon status={usable ? "ready" : "needs-setup"} />
                <Link href={`/workflows/#${workflow.id}`} className={cn("truncate hover:underline", focusRing)}>
                  {workflow.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </td>
      <td className="px-3 py-2.5">
        <p className="truncate text-sm">
          {view.source.mode ? DATA_MODE_LABEL[view.source.mode] : PULL_STATUS_LABEL.missing}
          {view.source.provider && <span className="text-fg-2"> · {view.source.provider}</span>}
        </p>
        <SourceBadge source={view.source} className="mt-1" />
      </td>
      <td className="px-3 py-2.5 text-xs text-fg-2">
        {[PLATFORMS[account.platform].audienceLabel, ...PLATFORMS[account.platform].metrics.map((item) => item.label)].join("、")}
      </td>
      <td className="px-3 py-2.5 text-xs">
        {view.gaps.length === 0 ? (
          <span className="text-fg-2">—</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {view.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  )
}

/**
 * A2 接入情况：每个号接一个平台要做的两件事（作品产出的工作流、数据获取的工具）和还缺什么，横着比。
 * 要配的东西点账号名进详情的「接入」里填。
 */
export function SetupTable() {
  const accounts = useAccounts()
  const schedules = useSchedules()
  const schedule = schedules.find((item) => item.id === "data-pull")?.when
  return (
    <section id="setup" aria-labelledby="setup-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Plug className="size-4 text-fg-2" aria-hidden />
        <h2 id="setup-title" className="text-sm font-medium">
          接入情况
        </h2>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[880px] table-fixed text-sm">
          <thead className="bg-raised text-xs text-fg-2">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.label} scope="col" className={cn("h-8 px-3 text-left font-normal whitespace-nowrap", column.width)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="p-0">
                  <EmptyState icon={Plug} title="还没有要接入的账号" />
                </td>
              </tr>
            ) : (
              accounts.map((account) => <SetupRow key={account.id} account={account} schedule={schedule} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default SetupTable
