import { PLATFORM_ORDER, PLATFORMS, pickWorkflow, type PlatformId, type WorkSource, type WorkflowDef } from "@leafpress/core"
import { cn } from "cn"
import { Workflow } from "lucide-react"
import Link from "next/link"

import { PlatformMark } from "@/components/base/marks"
import { focusRing } from "@/lib/styles"

const SOURCES: { label: string; value: WorkSource; platform?: PlatformId }[] = [
  { label: "灵感", value: { kind: "idea", ideaId: "" } },
  { label: "直接新建", value: { kind: "none" } },
  { label: "博客作品", value: { kind: "work", workId: "" }, platform: "blog" },
  { label: "其他作品", value: { kind: "work", workId: "" }, platform: "zhihu" },
  { label: "导入", value: { kind: "import" } },
]

function rulesFor(platform: PlatformId) {
  const groups = new Map<string, { workflow: WorkflowDef; sources: string[] }>()
  for (const source of SOURCES) {
    const workflow = pickWorkflow(platform, source.value, source.platform)
    const group = groups.get(workflow.id) ?? { workflow, sources: [] }
    group.sources.push(source.label)
    groups.set(workflow.id, group)
  }
  return [...groups.values()].map(({ workflow, sources }) => ({
    platform,
    workflow,
    source: sources.length === SOURCES.length ? "都行" : sources.join("、"),
  }))
}

const RULES = PLATFORM_ORDER.flatMap(rulesFor)

export function PickRules() {
  return (
    <section id="rules" aria-labelledby="rules-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Workflow className="size-4 text-fg-2" aria-hidden />
        <h2 id="rules-title" className="text-sm font-medium">
          自动配规则
        </h2>
        <span className="text-sm text-fg-2 tabular">{RULES.length}</span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="h-8 bg-raised text-xs text-fg-2">
              <th scope="col" className="px-3 text-left font-normal">
                平台
              </th>
              <th scope="col" className="px-3 text-left font-normal">
                来源
              </th>
              <th scope="col" className="px-3 text-left font-normal">
                工作流
              </th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((rule, index) => (
              <tr key={`${rule.platform}-${rule.source}-${index}`} className="h-9 border-t border-line">
                <td className="px-3">
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformMark platform={rule.platform} />
                    {PLATFORMS[rule.platform].name}
                  </span>
                </td>
                <td className="px-3">{rule.source}</td>
                <td className="px-3">
                  <Link
                    href={`#${rule.workflow.id}`}
                    data-rule-workflow={rule.workflow.id}
                    className={cn("rounded-sm text-fg hover:underline", focusRing)}
                  >
                    {rule.workflow.name}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-3 py-2 text-xs text-fg-2">作品里可以更换工作流，开始执行前都能换。</p>
    </section>
  )
}

export default PickRules
