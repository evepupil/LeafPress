import { cn } from "cn"
import { Workflow } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/base/empty-state"
import { RunStateIcon } from "@/components/base/state-icons"
import { RUN_STATE_LABEL } from "@/data/labels"
import { RUNS } from "@/data/tools"
import { formatRelative } from "@/lib/format"
import { toolName } from "@/lib/metrics"
import { focusRing, focusRingInset } from "@/lib/styles"

/** 总览里只列最近开始的几次运行，完整的在工具页 */
const RECENT_LIMIT = 5

export function HomeRuns() {
  // RUNS 已经按开始时间从新到旧排好，直接取前几条
  const recent = RUNS.slice(0, RECENT_LIMIT)
  return (
    <section id="runs" aria-labelledby="runs-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Workflow className="size-4 text-fg-2" aria-hidden />
        <h2 id="runs-title" className="text-sm font-medium">
          最近运行
        </h2>
        <Link href="/tools/#runs" className={cn("ml-auto text-xs text-fg-2 hover:text-fg", focusRing)}>
          全部
        </Link>
      </div>

      {recent.length > 0 ? (
        <ul>
          {recent.map((run) => (
            <li key={run.id}>
              {/* 整行是链接：带上运行编号跳到工具页，工具页据此打开这次运行的详情 */}
              <Link
                href={`/tools/?run=${run.id}`}
                data-run-row={run.id}
                className={cn("flex h-12 min-w-0 items-center gap-2 px-3 hover:bg-hover", focusRingInset)}
              >
                <RunStateIcon state={run.state} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" title={run.title}>
                    {run.title}
                  </div>
                  <div className="truncate text-xs text-fg-2">
                    {toolName(run.toolId)} · {RUN_STATE_LABEL[run.state]}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-fg-2 tabular">{formatRelative(run.startedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Workflow} title="还没有运行记录" />
      )}
    </section>
  )
}

export default HomeRuns
