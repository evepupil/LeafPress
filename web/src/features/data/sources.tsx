"use client"

import { Clock, Database } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { SourceBadge } from "@/components/base/source-badge"
import { Button } from "@/components/ui/button"
import { ACCOUNTS, accountById } from "@/data/accounts"
import { DEMO_NOW } from "@/data/clock"
import { DATA_MODE_LABEL } from "@/data/labels"
import type { DataSource, IsoTime } from "@/data/types"
import { accountLabel } from "@/lib/metrics"
import { EntryDialog, blankEntryForm, type EntryForm } from "./sources-entry-dialog"

/** 地址栏 entry 参数对应的账号：只有手填方式的账号才打开弹窗，其余一律忽略 */
function manualAccountOf(entry: string | null): string | null {
  const account = ACCOUNTS.find((item) => item.id === entry)
  return account?.dataSource.mode === "manual" ? account.id : null
}

/** 数据来源：每个号的数据从哪来、什么时候拉、上次拉得怎么样；手填方式的号可以在这里补数据 */
export function DataSources() {
  const router = useRouter()
  const params = useSearchParams()
  // 手填保存后记下的时间（用演示时刻，显示成「刚刚」）；刷新就复原
  const [overrides, setOverrides] = useState<Record<string, IsoTime>>({})
  // 手填弹窗对应的账号，null 表示关着。从总览的「去手填」跳来时，地址栏带 entry 参数，挂载时读一次
  const [entryFor, setEntryFor] = useState<string | null>(() => manualAccountOf(params.get("entry")))
  const [form, setForm] = useState<EntryForm>(() => blankEntryForm(manualAccountOf(params.get("entry"))))

  const openEntry = (accountId: string) => {
    setForm(blankEntryForm(accountId))
    setEntryFor(accountId)
  }

  const closeEntry = () => {
    setEntryFor(null)
    // 弹窗是被地址栏参数打开的，关的时候把参数清掉，刷新或转发链接不会再自动弹出
    if (params.has("entry")) router.replace("/data/", { scroll: false })
  }

  const saveEntry = () => {
    if (entryFor === null) return
    setOverrides((current) => ({ ...current, [entryFor]: DEMO_NOW }))
    toast.success(`已记下${accountLabel(accountById(entryFor))}的数据`)
    closeEntry()
  }

  return (
    <section id="sources" aria-labelledby="sources-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Database className="size-4 text-fg-2" aria-hidden />
        <h2 id="sources-title" className="text-sm font-medium">
          数据来源
        </h2>
      </div>
      <ul className="divide-y divide-line">
        {ACCOUNTS.map((account) => {
          const override = overrides[account.id]
          // 手填过的号，状态按「刚刚拉取成功」显示；原始数据不动
          const source: DataSource = override ? { ...account.dataSource, lastPullAt: override, lastResult: "ok" } : account.dataSource
          const failed = source.lastResult === "failed"
          return (
            <li key={account.id} data-source-row={account.id} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <AccountTag account={account} size="md" showPlatform />
                {source.mode === "manual" ? (
                  <Button variant="outline" size="sm" className="ml-auto" data-source-entry onClick={() => openEntry(account.id)}>
                    手填
                  </Button>
                ) : failed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    data-source-retry
                    onClick={() => toast.warning("还是返回 401，先到 Umami 后台换密钥")}
                  >
                    重试
                  </Button>
                ) : null}
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
                  {source.failReason}。{source.fixHint}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <EntryDialog
        account={entryFor === null ? null : accountById(entryFor)}
        form={form}
        onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
        onClose={closeEntry}
        onSave={saveEntry}
      />
    </section>
  )
}

export default DataSources
