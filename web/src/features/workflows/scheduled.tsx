"use client"

import { formatRelative } from "@leafpress/core"
import { cn } from "cn"
import { Clock, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { LabelChip } from "@/components/base/label-chip"
import { RunResultIcon, Spinner } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { focusRing } from "@/lib/styles"
import { useNow } from "@/lib/local-clock"
import { pullNow } from "@/state/actions/data"
import { useSchedules } from "@/state/data"

const FIX_HREF = "/data/#sources"

function ScheduledBlock({ item, divided }: { item: ReturnType<typeof useSchedules>[number]; divided: boolean }) {
  const now = useNow()
  const [running, setRunning] = useState(false)
  const failed = item.lastResult === "failed"
  const canPull = item.id === "data-pull"

  const run = async () => {
    if (!canPull || running) return
    setRunning(true)
    try {
      const result = await pullNow()
      toast.success(result.note)
    } catch (error) {
      toast(error instanceof Error ? error.message : "拉取数据失败")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div data-scheduled={item.id} className={cn("flex flex-col gap-1.5 px-3 py-2.5", divided && "border-t border-line")}>
      <div className="flex items-center gap-2">
        {item.lastResult ? (
          <RunResultIcon result={item.lastResult} />
        ) : (
          <Clock className="size-3.5 shrink-0 text-fg-3" aria-label="尚无运行记录" />
        )}
        <span className="truncate text-sm font-medium">{item.name}</span>
        <span className="shrink-0 text-xs text-fg-2 tabular">{item.when}</span>
        {canPull && (
          <Button
            size="xs"
            variant="outline"
            data-run-now
            disabled={running}
            aria-busy={running}
            className="ml-auto"
            onClick={() => void run()}
          >
            {running ? <Spinner className="size-3" /> : <RefreshCw />}现在拉取
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-2 tabular">
        {item.lastRunAt && now ? formatRelative(item.lastRunAt, now) : "尚无运行记录"}
        {item.lastNote ? ` · ${item.lastNote}` : ""}
        {failed && item.id === "data-pull" && (
          <Link href={FIX_HREF} className={cn("ml-1.5 rounded-sm font-medium text-fg hover:underline", focusRing)}>
            去修复
          </Link>
        )}
      </p>
      <div className="flex flex-wrap gap-1">
        <LabelChip>{item.installed ? "已安装计划任务" : "未安装计划任务"}</LabelChip>
        {!canPull && <LabelChip>由 AI 计划任务运行</LabelChip>}
      </div>
    </div>
  )
}

export function ScheduledRuns() {
  const schedules = useSchedules().filter((item) => item.installed)
  if (schedules.length === 0) return null
  return (
    <section id="scheduled" aria-labelledby="scheduled-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Clock className="size-4 text-fg-2" aria-hidden />
        <h2 id="scheduled-title" className="text-sm font-medium">
          定时工作流
        </h2>
        <span className="text-sm text-fg-2 tabular">{schedules.length}</span>
      </div>
      {schedules.map((item, index) => (
        <ScheduledBlock key={item.id} item={item} divided={index > 0} />
      ))}
    </section>
  )
}

export default ScheduledRuns
