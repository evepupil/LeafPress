import { cn } from "cn"
import { Settings } from "lucide-react"

import { WorkflowStatusIcon } from "@/components/base/state-icons"
import { WORKFLOW_STATUS_LABEL } from "@/data/labels"
import type { Tool } from "@/data/types"
import { TOOLS } from "@/data/workflows"

/** 工具类型的说法 */
const KIND_LABEL: Record<Tool["kind"], string> = {
  skill: "skill",
  cli: "命令行",
  api: "接口",
  code: "代码",
}

/** 工具：工作流里用到的 skill、命令行、接口和代码，一行一个，看哪些还没配置好 */
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
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <thead>
            <tr className="h-8 bg-raised text-xs text-fg-2">
              <th scope="col" className="w-[180px] px-3 text-left font-normal">
                名称
              </th>
              <th scope="col" className="w-[72px] px-3 text-left font-normal">
                类型
              </th>
              <th scope="col" className="px-3 text-left font-normal">
                说明
              </th>
              <th scope="col" className="w-[88px] px-3 text-left font-normal">
                状态
              </th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((tool) => (
              <tr key={tool.name} data-tool-row className="h-9 border-t border-line">
                <td className="truncate px-3 font-medium">{tool.name}</td>
                <td className="px-3 text-fg-2">{KIND_LABEL[tool.kind]}</td>
                <td className="truncate px-3 text-fg-2" title={tool.note}>
                  {tool.note}
                </td>
                <td className="px-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap",
                      tool.status === "needs-setup" ? "text-warn" : "text-fg-2",
                    )}
                  >
                    <WorkflowStatusIcon status={tool.status} />
                    {WORKFLOW_STATUS_LABEL[tool.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default ToolTable
