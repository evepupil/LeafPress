import { cn } from "cn"
import { TriangleAlert } from "lucide-react"

import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import { WorkflowStatusIcon } from "@/components/base/state-icons"
import { WORKFLOW_STATUS_LABEL } from "@/data/labels"
import type { Workflow } from "@/data/types"
import { WorkflowSay } from "./cards-say"
import { WorkflowSteps } from "./cards-steps"

/** 这个工作流现在有几个作品在用、几个已经用完 */
export interface WorkflowUsage {
  active: number
  done: number
}

/** 工作流从什么来 */
const FROM_LABEL: Record<Workflow["from"], string> = {
  idea: "从灵感",
  "blog-work": "从博客作品",
  any: "什么都行",
}

/**
 * 一个发布工作流一张卡：平台和状态、说明、来源和发布方式、每一步谁来做、怎么在 agent 里说。
 * highlighted 为真时（地址栏锚点指到这张卡）带一圈焦点环。
 */
export function WorkflowCard({ workflow, usage, highlighted }: { workflow: Workflow; usage: WorkflowUsage; highlighted: boolean }) {
  const needsSetup = workflow.status === "needs-setup"

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
        <PlatformMark platform={workflow.platform} size={18} />
        <h2 className="truncate text-sm font-medium">{workflow.name}</h2>
        <WorkflowStatusIcon status={workflow.status} />
        <span className={cn("shrink-0 text-xs", needsSetup ? "text-warn" : "text-fg-2")}>{WORKFLOW_STATUS_LABEL[workflow.status]}</span>
        <span data-workflow-usage className="ml-auto shrink-0 text-xs text-fg-2 tabular">
          {`在用 ${usage.active} · 完成 ${usage.done}`}
        </span>
      </header>

      <p className="px-3 pt-2.5 text-sm text-fg-2">{workflow.summary}</p>

      <div className="flex flex-wrap gap-1 px-3 pt-2">
        <LabelChip>{FROM_LABEL[workflow.from]}</LabelChip>
        {workflow.autoPublish ? <LabelChip color="green">自动发布</LabelChip> : <LabelChip color="amber">最后你来投递</LabelChip>}
      </div>

      <WorkflowSteps steps={workflow.steps} />

      {needsSetup && workflow.setupHint && (
        <p className="mx-3 mb-2.5 flex items-start gap-1.5 rounded-md bg-raised px-2.5 py-2 text-xs text-warn">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {workflow.setupHint}
        </p>
      )}

      <WorkflowSay say={workflow.say} />
    </article>
  )
}
