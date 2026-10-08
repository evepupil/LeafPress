import { WORKFLOWS } from "@leafpress/core"
import { PageFrame } from "@/features/shell/page-frame"
import { PickRules } from "@/features/workflows/pick-rules"
import { ScheduledRuns } from "@/features/workflows/scheduled"
import { ToolTable } from "@/features/workflows/tools"
import { WorkflowCards } from "@/features/workflows/cards"

export default function Page() {
  return (
    <PageFrame title="工作流" meta={<span className="tabular">{WORKFLOWS.length}</span>}>
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <WorkflowCards />
        <div className="grid items-start gap-(--gap-card) xl:grid-cols-2">
          <div className="min-w-0">
            <ScheduledRuns />
          </div>
          <div className="min-w-0">
            <PickRules />
          </div>
        </div>
        <ToolTable />
      </div>
    </PageFrame>
  )
}
