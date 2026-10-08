"use client"

import { cn } from "cn"
import { Plug, RefreshCw } from "lucide-react"
import Link from "next/link"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  DATA_MODE_LABEL,
  SETTING_STATUS_LABEL,
  SETUP_STATE_LABEL,
  SETUP_USE_LABEL,
  PLATFORMS,
  setupView,
  type LabelColor,
  type SetupItemView,
  type SetupState,
} from "@leafpress/core"
import { EmptyState } from "@/components/base/empty-state"
import { LabelChip } from "@/components/base/label-chip"
import { SourceBadge } from "@/components/base/source-badge"
import { WorkflowStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { focusRing } from "@/lib/styles"
import { pullNow } from "@/state/actions/data"
import { setSetting } from "@/state/actions/accounts"
import { useAccount, usePulls, useSchedules } from "@/state/data"

const STATE_COLOR: Record<SetupState, LabelColor> = { ready: "green", broken: "red", unfinished: "amber" }

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line px-3 py-3 first:border-t-0">
      <h3 className="text-xs text-fg-2">{title}</h3>
      {children}
    </div>
  )
}

function ConfigRow({ accountId, item }: { accountId: string; item: SetupItemView }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await setSetting(accountId, item.key, value.trim())
      setEditing(false)
      setValue("")
      toast.success(`${item.label}已配置`)
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存配置失败")
    } finally {
      setSaving(false)
    }
  }

  const shown = item.value ? (item.secret ? "••••••" : item.value) : item.status === "ok" ? "已配置" : "—"
  return (
    <li data-setup-item={item.key} data-setup-item-status={item.status} className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sm">{item.label}</span>
        <span className="shrink-0 text-xs text-fg-2">{SETUP_USE_LABEL[item.usedFor]}</span>
        <span className="ml-auto shrink-0">
          <LabelChip color={item.status === "ok" ? undefined : item.status === "expired" ? "red" : "amber"}>
            {SETTING_STATUS_LABEL[item.status]}
          </LabelChip>
        </span>
      </div>
      {editing ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
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
          <Button type="submit" size="sm" disabled={!value.trim() || saving} data-setup-save>
            保存
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("min-w-0 flex-1 truncate font-mono text-xs", item.value || item.status === "ok" ? "text-fg" : "text-fg-3")}
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

export function AccountSetup({ accountId }: { accountId: string }) {
  const account = useAccount(accountId)
  const pulls = usePulls()
  const schedules = useSchedules()
  const pull = pulls.find((item) => item.accountId === accountId)
  const schedule = schedules.find((item) => item.id === "data-pull")?.when
  const view = useMemo(
    () => (account ? setupView(account, PLATFORMS[account.platform], { pull, schedule }) : undefined),
    [account, pull, schedule],
  )
  const [pulling, setPulling] = useState(false)
  if (!account || !view) return <EmptyState title="没有这个账号" />

  const pullOnce = async () => {
    setPulling(true)
    try {
      const result = await pullNow([accountId])
      toast(result.note)
    } catch (error) {
      toast(error instanceof Error ? error.message : "拉取失败")
    } finally {
      setPulling(false)
    }
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
          {view.workflows.map((workflow) => {
            const usable = view.usableWorkflows.some((item) => item.id === workflow.id)
            return (
              <li key={workflow.id} className="flex flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <WorkflowStatusIcon status={usable ? "ready" : "needs-setup"} />
                  <Link href={`/workflows/#${workflow.id}`} className={cn("min-w-0 truncate hover:underline", focusRing)}>
                    {workflow.name}
                  </Link>
                  <span className={cn("ml-auto shrink-0 text-xs", usable ? "text-fg-2" : "text-warn")}>{usable ? "可用" : "待配置"}</span>
                </div>
                {!usable && workflow.requires.length > 0 && (
                  <p className="pl-6 text-xs text-warn">
                    需要配置：
                    {workflow.requires
                      .map((key) => PLATFORMS[account.platform].setupItems.find((item) => item.key === key)?.label ?? key)
                      .join("、")}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </Part>
      <Part title="数据获取">
        <div className="flex min-w-0 flex-col gap-1.5" data-setup-source={view.source.status}>
          <p className="truncate text-sm">
            {view.source.mode ? DATA_MODE_LABEL[view.source.mode] : "数据工具还没接"}
            {view.source.provider && (
              <span className="text-fg-2">
                {" "}
                · {view.source.provider}
                {view.source.schedule ? ` · ${view.source.schedule}` : ""}
              </span>
            )}
          </p>
          <SourceBadge source={view.source} />
          {view.source.status === "failed" && <p className="text-xs text-bad">{view.source.failReason}</p>}
          {view.source.status === "failed" && view.source.fixHint && <p className="text-xs text-fg-2">{view.source.fixHint}</p>}
          <p className="text-xs text-fg-2">
            能拿到：{[PLATFORMS[account.platform].audienceLabel, ...view.metrics.map((item) => item.label)].join("、")}
          </p>
          {view.source.status !== "missing" && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => void pullOnce()} disabled={pulling} data-setup-pull>
              {pulling ? (
                "正在拉取"
              ) : (
                <>
                  <RefreshCw />
                  现在拉一次
                </>
              )}
            </Button>
          )}
        </div>
      </Part>
      {view.items.length > 0 && (
        <Part title="要配的东西">
          <ul className="flex flex-col gap-3">
            {view.items.map((item) => (
              <ConfigRow key={item.key} accountId={accountId} item={item} />
            ))}
          </ul>
        </Part>
      )}
      <Part title="还缺什么">
        {view.gaps.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-warn">
            {view.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-2">没有缺项</p>
        )}
      </Part>
    </section>
  )
}

export default AccountSetup
