import { cn } from "cn"
import { Bot, Hand, Terminal, type LucideIcon } from "lucide-react"

import { STEP_KIND_LABEL } from "@/data/labels"
import type { StepKind, WorkflowStep } from "@/data/types"

/** 步骤种类的图形：AI 做、自动做、要你动手 */
const KIND_ICON: Record<StepKind, LucideIcon> = {
  ai: Bot,
  code: Terminal,
  manual: Hand,
}

/** 一个工作流的全部步骤。要你动手的步骤用警示色标出来，一眼能找到「你来」的那几步 */
export function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol data-workflow-steps className="flex flex-col gap-px px-3 py-2.5">
      {steps.map((step, index) => {
        const Icon = KIND_ICON[step.kind]
        const manual = step.kind === "manual"
        return (
          <li key={`${index}-${step.name}`} data-step-kind={step.kind} className="flex min-h-7 items-center gap-2 text-sm">
            <span className="w-4 shrink-0 text-right text-xs text-fg-2 tabular">{index + 1}</span>
            <Icon
              role="img"
              aria-label={STEP_KIND_LABEL[step.kind]}
              className={cn("size-3.5 shrink-0", manual ? "text-warn" : "text-fg-3")}
            />
            <span title={step.name} className={cn("truncate", manual && "text-warn")}>
              {step.name}
            </span>
            {step.tool && (
              <span title={step.tool} className="ml-auto truncate text-xs text-fg-2">
                {step.tool}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
