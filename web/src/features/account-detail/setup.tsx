"use client"

import { cn } from "cn"
import { Plug, RefreshCw } from "lucide-react"
import Link from "next/link"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"

import { LabelChip } from "@/components/base/label-chip"
import { SourceBadge } from "@/components/base/source-badge"
import { WorkflowStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { accountById } from "@/data/accounts"
import { DATA_MODE_LABEL, SETUP_ITEM_LABEL, SETUP_STATE_LABEL, USED_FOR_LABEL, WORKFLOW_STATUS_LABEL } from "@/data/labels"
import type { LabelColor, SetupItem, SetupState } from "@/data/types"
import { setupView } from "@/lib/setup"
import { focusRing } from "@/lib/styles"
import { pullNow } from "@/state/actions"
import { useAccounts } from "@/state/accounts"

const STATE_COLOR: Record<SetupState, LabelColor> = { ready: "green", broken: "red", unfinished: "amber" }
const ITEM_COLOR: Record<SetupItem["status"], LabelColor | undefined> = { ok: undefined, missing: "amber", expired: "red" }

/** 段标题：小字灰色，段与段之间一条细线 */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line px-3 py-3 first:border-t-0">
      <h3 className="text-xs text-fg-2">{title}</h3>
      {children}
    </div>
  )
}

/** 要配的一样东西：值（密钥只显示已配置）、状态，点「填写 / 更换」原地改 */
function ConfigRow({ accountId, item }: { accountId: string; item: SetupItem }) {
  const setConfig = useAccounts((state) => state.setConfig)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")

  const save = () => {
    if (!value.trim()) return
    setConfig(accountId, item.key, value.trim())
    setEditing(false)
    setValue("")
    toast.success(`${item.label}已配置`)
  }

  const shown = item.value ? (item.secret ? "••••••" : item.value) : "—"
  return (
    <li data-setup-item={item.key} data-setup-item-status={item.status} className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sm">{item.label}</span>
        {item.usedFor && <span className="shrink-0 text-xs text-fg-2">{USED_FOR_LABEL[item.usedFor]}</span>}
        <span className="ml-auto shrink-0">
          <LabelChip color={ITEM_COLOR[item.status]}>{SETUP_ITEM_LABEL[item.status]}</LabelChip>
        </span>
      </div>
      {editing ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <Input
            autoFocus
            aria-label={item.label}
            data-setup-input
            type={item.secret ? "password" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-7 min-w-0 flex-1 text-xs"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            取消
          </Button>
          <Button type="submit" size="sm" disabled={!value.trim()} data-setup-save>
            保存
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("min-w-0 flex-1 truncate font-mono text-xs", item.value ? "text-fg" : "text-fg-3")}
            title={item.secret ? undefined : item.value}
          >
            {shown}
          </span>
          <Button size="xs" variant="outline" onClick={() => setEditing(true)} data-setup-edit={item.key}>
            {item.status === "ok" ? "更换" : "填写"}
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * D5 接入：接一个平台要做的两件事（作品产出的工作流、数据获取的工具）和这个号要配的东西。
 * 数据都靠工具拉，没有手填；要配的东西在这里填，填好后「现在拉一次」就按新配置拉。
 */
export function AccountSetup({ accountId }: { accountId: string }) {
  const account = accountById(accountId)
  const config = useAccounts((state) => state.config[accountId])
  const pull = useAccounts((state) => state.pulls[accountId])
  const view = useMemo(() => setupView(account, config, pull), [account, config, pull])
  const { source } = view

  const pullOnce = () => {
    const result = pullNow([accountId])
    if (result.ok) toast.success(result.note)
    else toast(result.note)
  }

  return (
    <section
      id="setup"
      aria-labelledby="setup-title"
      data-setup-block
      className="overflow-hidden rounded-lg border border-line bg-card shadow-sm"
    >
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Plug className="size-4 text-fg-2" aria-hidden />
        <h2 id="setup-title" className="text-sm font-medium">
          接入
        </h2>
        <span className="ml-auto" data-setup-state={view.state}>
          <LabelChip color={STATE_COLOR[view.state]}>{SETUP_STATE_LABEL[view.state]}</LabelChip>
        </span>
      </div>

      <Part title="作品产出">
        <ul className="flex flex-col gap-1.5">
          {view.workflows.map((workflow) => (
            <li key={workflow.id} className="flex flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <WorkflowStatusIcon status={workflow.status} />
                <Link href={`/workflows/#${workflow.id}`} className={cn("min-w-0 truncate hover:underline", focusRing)}>
                  {workflow.name}
                </Link>
                <span className={cn("ml-auto shrink-0 text-xs", workflow.status === "ready" ? "text-fg-2" : "text-warn")}>
                  {WORKFLOW_STATUS_LABEL[workflow.status]}
                </span>
              </div>
              {workflow.setupHint && <p className="pl-6 text-xs text-warn">{workflow.setupHint}</p>}
            </li>
          ))}
        </ul>
      </Part>

      <Part title="数据获取">
        <div className="flex min-w-0 flex-col gap-1.5" data-setup-source={source.status}>
          <p className="truncate text-sm">
            {DATA_MODE_LABEL[source.mode]}
            <span className="text-fg-2">
              {" "}
              · {source.provider} · {source.schedule}
            </span>
          </p>
          <SourceBadge source={source} />
          {source.status === "failed" && <p className="text-xs text-bad">{source.failReason}</p>}
          {source.status === "failed" && source.fixHint && <p className="text-xs text-fg-2">{source.fixHint}</p>}
          {source.status === "missing" && source.plan && <p className="text-xs text-fg-2">打算：{source.plan}</p>}
          <p className="text-xs text-fg-2">能拿到：{[account.audienceLabel, ...view.metrics.map((item) => item.label)].join("、")}</p>
          {source.status !== "missing" && (
            <Button size="sm" variant="outline" className="self-start" onClick={pullOnce} data-setup-pull>
              <RefreshCw />
              现在拉一次
            </Button>
          )}
        </div>
      </Part>

      <Part title="要配的东西">
        <ul className="flex flex-col gap-3">
          {view.items.map((item) => (
            <ConfigRow key={item.key} accountId={accountId} item={item} />
          ))}
        </ul>
      </Part>
    </section>
  )
}

export default AccountSetup
