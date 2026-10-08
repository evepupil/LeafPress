import { WORKFLOWS } from "@leafpress/core"
import { EmptyState } from "@/components/base/empty-state"
import { Settings } from "lucide-react"

const TOOLS = [...new Set(WORKFLOWS.flatMap((workflow) => workflow.steps.flatMap((step) => (step.tool ? [step.tool] : []))))].sort((a, b) =>
  a.localeCompare(b, "zh-CN"),
)

export function ToolTable() {
  return (
    <section id="tools" aria-labelledby="tools-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Settings className="size-4 text-fg-2" aria-hidden />
        <h2 id="tools-title" className="text-sm font-medium">
          工具
        </h2>
        <span className="text-sm text-fg-2 tabular">{TOOLS.length}</span>
      </div>
      {TOOLS.length === 0 ? (
        <EmptyState icon={Settings} title="当前没有工具" />
      ) : (
        <ul className="grid gap-px sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const uses = WORKFLOWS.filter((workflow) => workflow.steps.some((step) => step.tool === tool))
            return (
              <li key={tool} className="flex min-h-10 items-center gap-2 border-t border-line px-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium" title={tool}>
                  {tool}
                </span>
                <span className="ml-auto min-w-0 text-right text-xs text-fg-2">{uses.map((workflow) => workflow.name).join("、")}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default ToolTable
