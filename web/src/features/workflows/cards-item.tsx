import { PLATFORM_ORDER, PLATFORMS, type WorkflowDef } from "@leafpress/core"
import { cn } from "cn"
import { TriangleAlert } from "lucide-react"

import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import { WorkflowStatusIcon } from "@/components/base/state-icons"
import { WorkflowSteps } from "./cards-steps"
import { WorkflowSay } from "./cards-say"

export interface WorkflowUsage {
  active: number
  done: number
}

const FROM_LABEL: Record<WorkflowDef["from"], string> = {
  idea: "从灵感",
  "blog-work": "从博客作品",
  any: "什么都行",
}

export function WorkflowCard({
  workflow,
  usage,
  ready,
  highlighted,
}: {
  workflow: WorkflowDef
  usage: WorkflowUsage
  ready: boolean
  highlighted: boolean
}) {
  const platformIds = workflow.platform === "any" ? PLATFORM_ORDER : [workflow.platform]
  const requirements = workflow.requires.flatMap((key) => {
    for (const id of platformIds) {
      const item = PLATFORMS[id].setupItems.find((setting) => setting.key === key)
      if (item) return [item.label]
    }
    return [key]
  })
  const uniqueRequirements = [...new Set(requirements)]

  return (
    <article
      id={workflow.id}
      data-workflow={workflow.id}
      className={cn(
        "flex min-w-0 scroll-mt-3 flex-col rounded-lg border border-line bg-card shadow-sm",
        highlighted && "ring-2 ring-(--focus-ring)",
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        {workflow.platform !== "any" ? (
          <PlatformMark platform={workflow.platform} size={18} />
        ) : (
          <span className="flex size-[18px] items-center justify-center rounded-sm bg-raised text-[10px] text-fg-2">全</span>
        )}
        <h2 className="truncate text-sm font-medium">{workflow.name}</h2>
        <WorkflowStatusIcon status={ready ? "ready" : "needs-setup"} />
        <span className={cn("shrink-0 text-xs", ready ? "text-fg-2" : "text-warn")}>{ready ? "可用" : "待配置"}</span>
        <span data-workflow-usage className="ml-auto shrink-0 text-xs text-fg-2 tabular">
          在用 {usage.active} · 完成 {usage.done}
        </span>
      </header>
      <p className="px-3 pt-2.5 text-sm text-fg-2">{workflow.summary}</p>
      <div className="flex flex-wrap gap-1 px-3 pt-2">
        <LabelChip>{workflow.platform === "any" ? "通用" : PLATFORMS[workflow.platform].name}</LabelChip>
        <LabelChip>{FROM_LABEL[workflow.from]}</LabelChip>
      </div>
      <WorkflowSteps steps={workflow.steps} />
      {!ready && uniqueRequirements.length > 0 && (
        <p className="mx-3 mb-2.5 flex items-start gap-1.5 rounded-md bg-raised px-2.5 py-2 text-xs text-warn">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          需要配置：{uniqueRequirements.join("、")}
        </p>
      )}
      <WorkflowSay say={workflow.say} />
    </article>
  )
}
