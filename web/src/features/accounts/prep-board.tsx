"use client"

import { cn } from "cn"
import { ListChecks } from "lucide-react"
import { useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { BoardColumn, Surface } from "@/components/base/board"
import { ProgressMeter } from "@/components/base/progress-meter"
import { StatusIcon } from "@/components/base/status-icon"
import { ACCOUNTS } from "@/data/accounts"
import { STAGE_LABEL } from "@/data/labels"
import { formatDay } from "@/lib/format"
import { focusRingInset } from "@/lib/styles"

/** 还在筹备的账号，顺序同账号清单；每个号的筹备清单在 prep 里 */
const PREPARING = ACCOUNTS.filter((account) => account.stage === "preparing")

/**
 * A3 筹备中：每个筹备中的号一张卡，清单可以直接勾。
 * 勾选状态按账号编号存一组布尔值，初始照数据里的完成情况；进度由它现算，所以点一项进度就跟着变。
 */
export function PrepBoard() {
  const [checked, setChecked] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(PREPARING.map((account) => [account.id, (account.prep ?? []).map((item) => item.done)])),
  )

  const toggle = (accountId: string, index: number) =>
    setChecked((current) => ({
      ...current,
      [accountId]: (current[accountId] ?? []).map((done, i) => (i === index ? !done : done)),
    }))

  return (
    <div id="prep" className="min-w-0">
      {/* 这一块占满一整行，卡片并排放两列（手机上一列）；items-start 让两张卡各按自己的内容定高，不互相拉齐 */}
      <BoardColumn
        icon={<ListChecks className="size-4 text-fg-2" aria-hidden />}
        title={STAGE_LABEL.preparing}
        count={PREPARING.length}
        bodyClassName="grid items-start gap-(--gap-card) md:grid-cols-2"
      >
        {PREPARING.length === 0 && <p className="px-2 py-3 text-xs text-fg-2">没有筹备中的号</p>}
        {PREPARING.map((a) => {
          const items = a.prep ?? []
          const flags = checked[a.id] ?? []
          const doneCount = flags.filter(Boolean).length
          return (
            <Surface key={a.id} className="flex flex-col gap-2 px-3 py-2.5" data-prep-account={a.id}>
              <div className="flex min-w-0 items-center gap-2">
                <AccountTag account={a} size="md" showPlatform />
                <span className="ml-auto shrink-0 text-xs text-fg-2 tabular">{`开号 ${formatDay(a.since)}`}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-fg-2 tabular">
                <span data-prep-progress={a.id}>{`${doneCount}/${items.length}`}</span>
                <ProgressMeter value={items.length > 0 ? doneCount / items.length : 0} className="w-16" />
              </div>
              <ul className="flex flex-col">
                {items.map((item, index) => {
                  const done = flags[index] ?? false
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        data-prep-item
                        onClick={() => toggle(a.id, index)}
                        className={cn(
                          "flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors duration-(--dur-fast) hover:bg-hover",
                          focusRingInset,
                        )}
                      >
                        {done ? <StatusIcon glyph="check" tone="done" /> : <StatusIcon glyph="ring" tone="idle" />}
                        <span className={cn("min-w-0 break-words", done && "text-fg-2")}>{item.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Surface>
          )
        })}
      </BoardColumn>
    </div>
  )
}

export default PrepBoard
