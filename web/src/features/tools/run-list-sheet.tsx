"use client"

import { cn } from "cn"
import Link from "next/link"
import { useRef, useState } from "react"

import { RunStateIcon, StepStateIcon } from "@/components/base/state-icons"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { RUN_STATE_LABEL, STEP_KIND_LABEL } from "@/data/labels"
import type { ToolRun } from "@/data/types"
import { workById } from "@/data/works"
import { formatDuration, formatRelative, formatTime } from "@/lib/format"
import { toolName } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"
import { FailedPanel, WaitingPanel } from "./run-list-sheet-panels"

interface RunSheetProps {
  /** 要看的那条运行；为空时抽屉关着 */
  run: ToolRun | null
  backfill: string
  onBackfillChange(value: string): void
  onBackfill(): void
  onConfirm(): void
  onRetry(): void
  onClose(): void
}

/** 开始于、用时：第二行说明 */
function runSummary(run: ToolRun): string {
  return [
    toolName(run.toolId),
    RUN_STATE_LABEL[run.state],
    `开始于 ${formatRelative(run.startedAt)}`,
    run.finishedAt ? `用时 ${formatDuration(run.startedAt, run.finishedAt)}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
}

function StepList({ run }: { run: ToolRun }) {
  return (
    <ol className="flex flex-col px-4 py-3">
      {run.steps.map((step, index) => (
        <li key={`${index}-${step.name}`} data-run-step className="flex gap-2.5 py-1.5">
          <StepStateIcon state={step.state} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 text-sm break-words">{step.name}</span>
              <span className="shrink-0 rounded-[4px] bg-column px-1 text-xs text-fg-2">{STEP_KIND_LABEL[step.kind]}</span>
            </div>
            {step.note && <p className="text-xs break-words text-fg-2">{step.note}</p>}
          </div>
          {step.at && <span className="shrink-0 text-xs text-fg-2 tabular">{formatTime(step.at)}</span>}
        </li>
      ))}
    </ol>
  )
}

/** 运行详情抽屉：谁在等你、哪里失败了、每一步做到哪、产出了哪篇作品 */
export function RunSheet({ run, backfill, onBackfillChange, onBackfill, onConfirm, onRetry, onClose }: RunSheetProps) {
  // 关闭时 run 变成空，但抽屉还要滑出去，内容得留着直到滑完：记住最后看的那条
  const [lastRun, setLastRun] = useState<ToolRun | null>(run)
  if (run !== null && run !== lastRun) setLastRun(run)
  const shown = run ?? lastRun
  // 打开前焦点在哪（点的哪一行、哪个链接），关闭时还给它，键盘用户不会丢位置
  const openerRef = useRef<HTMLElement | null>(null)

  return (
    <Sheet
      open={run !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {/* 抽屉组件自带的宽度写在 data-[side=right] 前缀下，不带前缀的 w-full 会被它压住，所以这里用同样的前缀覆盖 */}
      <SheetContent
        side="right"
        className="gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
        data-run-sheet
        onOpenAutoFocus={(event) => {
          // 默认会把光标放进第一个输入框，手机上一打开就弹键盘；改成让焦点落在抽屉本身，要填的时候再点输入框
          event.preventDefault()
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
        }}
        onCloseAutoFocus={(event) => {
          // 抽屉不是由某个触发按钮打开的，组件找不到该把焦点还给谁，这里自己还
          event.preventDefault()
          openerRef.current?.focus()
        }}
      >
        {shown && (
          <>
            <SheetHeader className="gap-0 border-b border-line pr-11">
              <div className="flex items-center gap-2">
                <RunStateIcon state={shown.state} />
                <SheetTitle className="min-w-0 text-sm font-medium break-words" data-run-sheet-title>
                  {shown.title}
                </SheetTitle>
              </div>
              <SheetDescription className="mt-1 text-xs text-fg-2">{runSummary(shown)}</SheetDescription>
            </SheetHeader>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              {shown.state === "waiting" && (
                <WaitingPanel
                  run={shown}
                  backfill={backfill}
                  onBackfillChange={onBackfillChange}
                  onBackfill={onBackfill}
                  onConfirm={onConfirm}
                />
              )}
              {shown.state === "failed" && <FailedPanel run={shown} onRetry={onRetry} />}
              <StepList run={shown} />
            </div>

            {shown.workId && (
              <div className="flex shrink-0 items-baseline gap-2 border-t border-line px-4 py-3 text-sm">
                <span className="shrink-0 text-fg-2">相关作品</span>
                <Link
                  href={`/works/?open=${shown.workId}`}
                  className={cn("line-clamp-2 min-w-0 flex-1 rounded-sm break-words hover:underline", focusRing)}
                >
                  {workById(shown.workId).title}
                </Link>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
