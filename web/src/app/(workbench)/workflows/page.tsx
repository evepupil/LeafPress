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
        {/* 没有定时工作流时它那一格是空的（empty:hidden），自动配规则占满整行 */}
        <div className="flex flex-col items-start gap-(--gap-card) xl:flex-row">
          <div className="w-full min-w-0 flex-1 empty:hidden">
            <ScheduledRuns />
          </div>
          <div className="w-full min-w-0 flex-1">
            <PickRules />
          </div>
        </div>
        <ToolTable />
      </div>
    </PageFrame>
  )
}
