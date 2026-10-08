"use client"

import { cn } from "cn"
import { Database, TriangleAlert } from "lucide-react"
import Link from "next/link"

import { SourceBadge } from "@/components/base/source-badge"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { accountById } from "@/data/accounts"
import { DATA_MODE_LABEL } from "@/data/labels"

/** 一个动作按钮：文字 + 去哪 */
interface SourceAction {
  label: string
  href: string
}

export function AccountSource({ accountId }: { accountId: string }) {
  const { dataSource: source, prep } = accountById(accountId)
  const failed = source.lastResult === "failed"

  // 手填的号给「手填数据」，拉取失败的给「去修复」，两样都不是就只看数据
  const actions: SourceAction[] = []
  if (source.mode === "manual") actions.push({ label: "手填数据", href: `/data/?entry=${accountId}` })
  if (failed) actions.push({ label: "去修复", href: "/data/#sources" })
  if (actions.length === 0) actions.push({ label: "看数据", href: "/data/" })

  const prepDone = prep?.filter((item) => item.done).length ?? 0

  return (
    <section id="source" aria-labelledby="source-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <Database className="size-4 text-fg-2" aria-hidden />
        <h2 id="source-title" className="text-sm font-medium">
          数据来源
        </h2>
      </div>

      <dl className="grid grid-cols-[56px_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-fg-2">方式</dt>
        <dd className="min-w-0">{DATA_MODE_LABEL[source.mode]}</dd>
        <dt className="text-fg-2">来源</dt>
        <dd className="min-w-0 break-words text-fg-2">{source.provider}</dd>
        <dt className="text-fg-2">频率</dt>
        <dd className="min-w-0">{source.schedule}</dd>
        <dt className="text-fg-2">上次</dt>
        <dd className="min-w-0">
          <SourceBadge source={source} />
        </dd>
      </dl>

      {failed && (
        <div className="mt-2 rounded-md bg-raised px-3 py-2 text-sm">
          <p className="text-bad break-words">
            <TriangleAlert className="mr-1 inline size-3.5 align-text-bottom text-bad" aria-hidden />
            {source.failReason ?? "拉取失败"}
          </p>
          {source.fixHint && <p className="text-xs break-words text-fg-2">{source.fixHint}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <Button key={action.label} variant="outline" size="sm" asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ))}
      </div>

      {prep && prep.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <h3 className="pb-1.5 text-xs font-medium text-fg-2 tabular">
            筹备清单 {prepDone}/{prep.length}
          </h3>
          <ul className="flex flex-col gap-1">
            {prep.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {item.done ? (
                  <StatusIcon glyph="check" tone="done" label="已完成" />
                ) : (
                  <StatusIcon glyph="ring" tone="idle" label="未完成" />
                )}
                <span className={cn("min-w-0 break-words", item.done && "text-fg-2")}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default AccountSource
