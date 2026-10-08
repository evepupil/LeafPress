"use client"

import { cn } from "cn"
import Link from "next/link"

import { LabelChip } from "@/components/base/label-chip"
import { StepStateIcon } from "@/components/base/state-icons"
import { StatusIcon } from "@/components/base/status-icon"
import { STEP_KIND_LABEL } from "@/data/labels"
import type { Work, WorkflowStep } from "@/data/types"
import { focusRing } from "@/lib/styles"
import { progressText, stepState, workflowOf } from "@/lib/work-engine"
import { useWorks } from "@/state/works"
import { SheetSection } from "./work-sheet-parts"

function StepRow({ work, step, index, running }: { work: Work; step: WorkflowStep; index: number; running: boolean }) {
  const state = stepState(work, index)
  const current = work.status !== "done" && index === work.step
  const files = step.produces?.join("、")

  return (
    <li
      data-step={index}
      data-step-state={state}
      aria-current={current ? "step" : undefined}
      className={cn("flex min-h-8 items-start gap-2 rounded-md px-2 py-1.5", current && "bg-selected")}
    >
      <span className="mt-0.5 flex shrink-0">
        {/* 这一步在「进行中」，但页面没有在跑（外面的 agent 在做）：不转圈，画半圆 */}
        {state === "running" && !running ? <StatusIcon glyph="half" tone="progress" label="进行中" /> : <StepStateIcon state={state} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm break-words">{step.name}</span>
          <LabelChip color={step.kind === "manual" ? "amber" : undefined}>{STEP_KIND_LABEL[step.kind]}</LabelChip>
        </div>
        {(step.tool || files) && (
          <p className="text-xs break-words text-fg-2">
            {step.tool}
            {step.tool && files ? " · " : null}
            {files && <span className="font-mono">{files}</span>}
          </p>
        )}
      </div>
    </li>
  )
}

/** 工作流的每一步：做完的、正在做的、轮到你的、还没到的。当前这一步整行浅灰 */
export function WorkSheetSteps({ work }: { work: Work }) {
  const running = useWorks((state) => state.running.includes(work.id))
  const workflow = workflowOf(work)

  return (
    <SheetSection
      title="步骤"
      titleExtra={
        <Link
          href={`/workflows/#${workflow.id}`}
          className={cn("rounded-sm text-xs text-fg-2 transition-colors duration-(--dur-fast) hover:text-fg", focusRing)}
        >
          {workflow.name}
        </Link>
      }
      aside={<span className="text-xs text-fg-2 tabular">{progressText(work)}</span>}
    >
      <ol data-steps className="flex flex-col">
        {workflow.steps.map((step, index) => (
          <StepRow key={index} work={work} step={step} index={index} running={running} />
        ))}
      </ol>
    </SheetSection>
  )
}
