"use client"

import { cn } from "cn"

import { RunStateIcon } from "@/components/base/state-icons"
import { RUN_STATE_LABEL } from "@/data/labels"
import type { StepState, ToolRun } from "@/data/types"
import { formatRelative } from "@/lib/format"
import { toolName } from "@/lib/metrics"
import { focusRingInset } from "@/lib/styles"
import { stepCounts } from "./run-list-model"

/** 步骤小进度条的颜色：按步骤状态取现成的颜色变量 */
const STEP_BAR_COLOR: Record<StepState, string> = {
  done: "var(--chart-ink)",
  running: "var(--progress)",
  waiting: "var(--progress)",
  failed: "var(--risk)",
  pending: "var(--line-strong)",
}

/** 列表里的一行运行：状态图形、标题和说明、步骤进度、开始时间，整行可点开详情 */
export function RunRow({ run, onOpen }: { run: ToolRun; onOpen(id: string): void }) {
  const { done, total } = stepCounts(run)
  const detail = [toolName(run.toolId), RUN_STATE_LABEL[run.state], run.state === "waiting" ? run.waitingFor : undefined]
    .filter(Boolean)
    .join(" · ")

  return (
    <li>
      <button
        type="button"
        data-run-row={run.id}
        data-state={run.state}
        onClick={() => onOpen(run.id)}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition-colors duration-(--dur-fast) hover:bg-hover",
          focusRingInset,
        )}
      >
        <RunStateIcon state={run.state} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{run.title}</p>
          <p className="truncate text-xs text-fg-2">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-fg-2 tabular">
            {done}/{total}
          </span>
          <span className="flex gap-0.5" aria-hidden>
            {run.steps.map((step, index) => (
              <span key={index} className="h-1 w-1.5 rounded-full" style={{ background: STEP_BAR_COLOR[step.state] }} />
            ))}
          </span>
        </div>
        <span className="hidden w-20 shrink-0 text-right text-xs text-fg-2 tabular sm:block">{formatRelative(run.startedAt)}</span>
      </button>
    </li>
  )
}
