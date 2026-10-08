"use client"

import { progressText, stepState, workflowById, STEP_KIND_LABEL, type Work } from "@leafpress/core"
import { cn } from "cn"
import Link from "next/link"

import { LabelChip } from "@/components/base/label-chip"
import { StepStateIcon } from "@/components/base/state-icons"
import { focusRing } from "@/lib/styles"
import { SheetSection } from "./work-sheet-parts"

function StepRow({
  work,
  step,
  index,
}: {
  work: Work
  step: NonNullable<ReturnType<typeof workflowById>>["steps"][number]
  index: number
}) {
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
        <StepStateIcon state={state} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm break-words">{step.name}</span>
          <LabelChip color={step.kind === "manual" ? "amber" : undefined}>
            {step.kind === "ai" ? "Agent" : STEP_KIND_LABEL[step.kind]}
          </LabelChip>
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

export function WorkSheetSteps({ work }: { work: Work }) {
  const workflow = workflowById(work.workflowId)
  if (!workflow) return null
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
      aside={<span className="text-xs text-fg-2 tabular">{progressText(work, workflow)}</span>}
    >
      <ol data-steps className="flex flex-col">
        {workflow.steps.map((step, index) => (
          <StepRow key={step.id} work={work} step={step} index={index} />
        ))}
      </ol>
    </SheetSection>
  )
}
