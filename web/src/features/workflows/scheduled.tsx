"use client"

import { cn } from "cn"
import { Clock, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { LabelChip } from "@/components/base/label-chip"
import { RunResultIcon, Spinner } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import type { ScheduledWorkflow } from "@/data/types"
import { SCHEDULED } from "@/data/workflows"
import { formatRelative } from "@/lib/format"
import { focusRing } from "@/lib/styles"
import { runSchedule } from "@/state/actions"
import { useSchedules } from "@/state/schedules"

/** 点「现在跑一次」后转圈多久（毫秒），到点再给结果 */
const RUN_MS = 800

/** 拉数据失败时，去哪里修 */
const FIX_HREF = "/data/#sources"

/** 一个定时工作流：名字和时间、最近一次跑得怎样、有哪几步，右上角可以现在跑一次 */
function ScheduledBlock({ item, divided }: { item: ScheduledWorkflow; divided: boolean }) {
  const run = useSchedules((state) => state.runs[item.id])
  const [running, setRunning] = useState(false)
  const failed = run.lastResult === "failed"

  // 转圈期间起一个定时器，到点记下结果并弹提示；中途离开本页或重复触发时自动清掉
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => {
      setRunning(false)
      toast(runSchedule(item.id))
    }, RUN_MS)
    return () => clearTimeout(timer)
  }, [running, item.id])

  return (
    <div data-scheduled={item.id} className={cn("flex flex-col gap-1.5 px-3 py-2.5", divided && "border-t border-line")}>
      <div className="flex items-center gap-2">
        <RunResultIcon result={run.lastResult} />
        <span className="truncate text-sm font-medium">{item.name}</span>
        <span className="shrink-0 text-xs text-fg-2 tabular">{item.schedule}</span>
        <Button
          size="xs"
          variant="outline"
          data-run-now
          disabled={running}
          aria-busy={running}
          className="ml-auto"
          onClick={() => setRunning(true)}
        >
          {running ? <Spinner className="size-3" /> : <RefreshCw />}
          现在跑一次
        </Button>
      </div>

      <p className="text-xs text-fg-2 tabular">
        {formatRelative(run.lastRunAt)}
        {" · "}
        <span className={failed ? "text-bad" : undefined}>{run.lastNote}</span>
        {failed && item.id === "data-pull" && (
          <Link href={FIX_HREF} className={cn("ml-1.5 rounded-sm font-medium text-fg hover:underline", focusRing)}>
            去修复
          </Link>
        )}
      </p>

      <div className="flex flex-wrap gap-1">
        {item.steps.map((step) => (
          <LabelChip key={step}>{step}</LabelChip>
        ))}
      </div>
    </div>
  )
}

/** 定时工作流：每天、每周自己跑的几件事，以及最近一次的结果 */
export function ScheduledRuns() {
  return (
    <section id="scheduled" aria-labelledby="scheduled-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Clock className="size-4 text-fg-2" aria-hidden />
        <h2 id="scheduled-title" className="text-sm font-medium">
          定时工作流
        </h2>
        <span className="text-sm text-fg-2 tabular">{SCHEDULED.length}</span>
      </div>
      {SCHEDULED.map((item, index) => (
        <ScheduledBlock key={item.id} item={item} divided={index > 0} />
      ))}
    </section>
  )
}

export default ScheduledRuns
