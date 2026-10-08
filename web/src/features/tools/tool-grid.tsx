"use client"

import { Workflow } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { TOOL_STATUS_LABEL } from "@/data/labels"
import { TOOLS } from "@/data/tools"
import type { ToolStatus } from "@/data/types"
import { ToolCard } from "./tool-grid-card"

type ToolFilter = "all" | ToolStatus

const FILTER_OPTIONS: { value: ToolFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "ready", label: TOOL_STATUS_LABEL.ready },
  { value: "needs-setup", label: TOOL_STATUS_LABEL["needs-setup"] },
  { value: "planned", label: TOOL_STATUS_LABEL.planned },
]

/** 工具卡片墙：按状态筛选，每张卡的重点是「在 Claude Code 里怎么说」 */
export function ToolGrid() {
  const [filter, setFilter] = useState<ToolFilter>("all")
  const tools = filter === "all" ? TOOLS : TOOLS.filter((tool) => tool.status === filter)

  return (
    <section id="tools" aria-labelledby="tools-title">
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <h2 id="tools-title" className="text-sm font-medium">
          工具
        </h2>
        <span className="text-sm text-fg-2 tabular" data-tools-count>
          {tools.length}
        </span>
        <div className="ml-auto" data-tools-filter>
          <Segmented label="按状态筛选" value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
        </div>
      </div>
      {tools.length === 0 ? (
        <div className="rounded-lg border border-line bg-card shadow-sm">
          <EmptyState icon={Workflow} title="没有这一类工具" />
        </div>
      ) : (
        <div className="grid gap-(--gap-card) sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </section>
  )
}

export default ToolGrid
