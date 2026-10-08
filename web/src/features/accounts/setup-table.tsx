"use client"

import { cn } from "cn"
import { Plug } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { SourceBadge } from "@/components/base/source-badge"
import { WorkflowStatusIcon } from "@/components/base/state-icons"
import { ACCOUNTS, PLATFORMS } from "@/data/accounts"
import { DATA_MODE_LABEL, SETUP_STATE_LABEL } from "@/data/labels"
import type { Account, SetupState } from "@/data/types"
import { setupView } from "@/lib/setup"
import { focusRing } from "@/lib/styles"
import { useAccounts } from "@/state/accounts"

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

function SetupRow({ account }: { account: Account }) {
  const config = useAccounts((state) => state.config[account.id])
  const pull = useAccounts((state) => state.pulls[account.id])
  const view = setupView(account, config, pull)
  return (
    <tr data-setup-row={account.id} className="border-t border-line align-top">
      <td className="px-3 py-2.5">
        <Link href={`/accounts/${account.id}/#setup`} className={cn("block min-w-0", focusRing)}>
          <AccountTag account={account} size="md" showPlatform />
        </Link>
        <p className={cn("mt-1 text-xs", STATE_TEXT[view.state])} data-setup-state={view.state}>
          {SETUP_STATE_LABEL[view.state]}
        </p>
      </td>
      <td className="px-3 py-2.5">
        <ul className="flex flex-col gap-1">
          {view.workflows.map((workflow) => (
            <li key={workflow.id} className="flex min-w-0 items-center gap-1.5 text-sm">
              <WorkflowStatusIcon status={workflow.status} />
              <Link href={`/workflows/#${workflow.id}`} className={cn("truncate hover:underline", focusRing)}>
                {workflow.name}
              </Link>
            </li>
          ))}
        </ul>
      </td>
      <td className="px-3 py-2.5">
        <p className="truncate text-sm">
          {DATA_MODE_LABEL[view.source.mode]}
          <span className="text-fg-2"> · {view.source.provider}</span>
        </p>
        <SourceBadge source={view.source} className="mt-1" />
      </td>
      <td className="px-3 py-2.5 text-xs text-fg-2">
        {[account.audienceLabel, ...PLATFORMS[account.platform].metrics.map((item) => item.label)].join("、")}
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
            {ACCOUNTS.map((account) => (
              <SetupRow key={account.id} account={account} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default SetupTable
