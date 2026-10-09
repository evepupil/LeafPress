"use client"

import { formatRelative, type BootstrapScheduleView } from "@leafpress/core"
import { cn } from "cn"
import { Clock, RefreshCw } from "lucide-react"
import Link from "next/link"

import { LabelChip } from "@/components/base/label-chip"
import { RunResultIcon, Spinner } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { usePullNow } from "@/features/data/use-pull-now"
import { focusRing } from "@/lib/styles"
import { useNow } from "@/lib/local-clock"
import { useSchedules } from "@/state/data"
import { listedSchedules } from "@/state/schedules"

const FIX_HREF = "/data/#sources"
/** 装上「拉作品数据」计划任务要在终端运行的命令 */
const INSTALL_COMMAND = "leafpress schedule install"

function ScheduledBlock({ item, divided }: { item: BootstrapScheduleView; divided: boolean }) {
  const now = useNow()
  const { pulling, pull } = usePullNow()
  const failed = item.lastResult === "failed"
  const canPull = item.id === "data-pull"
  // 拉作品数据没装：只告诉用户怎么装，不显示运行记录和「现在拉取」（想现在拉去数据页）
  const notInstalled = canPull && !item.installed

  return (
    <div
      data-scheduled={item.id}
      data-schedule-installed={item.installed}
      className={cn("flex flex-col gap-1.5 px-3 py-2.5", divided && "border-t border-line")}
    >
      <div className="flex items-center gap-2">
        {item.installed && item.lastResult ? (
          <RunResultIcon result={item.lastResult} />
        ) : (
          <Clock className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        )}
        {/* 名字和时间（或「没装」）连成一句，窄了从后面截断 */}
        <p data-schedule-title className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-fg-2 tabular"> · {notInstalled ? "没装" : item.when}</span>
        </p>
        {canPull && item.installed && (
          <Button size="xs" variant="outline" data-run-now disabled={pulling} aria-busy={pulling} onClick={() => void pull()}>
            {pulling ? <Spinner className="size-3" /> : <RefreshCw />}现在拉取
          </Button>
        )}
      </div>
      {notInstalled ? (
        <p data-schedule-install-hint className="text-xs text-fg-2">
          在终端运行 <code className="font-mono text-fg">{INSTALL_COMMAND}</code> 装上
        </p>
      ) : (
        <p className="text-xs break-words text-fg-2 tabular">
          {item.lastRunAt && now ? formatRelative(item.lastRunAt, now) : "尚无运行记录"}
          {item.lastNote ? ` · ${item.lastNote}` : ""}
          {failed && canPull && (
            <Link href={FIX_HREF} className={cn("ml-1.5 rounded-sm font-medium text-fg hover:underline", focusRing)}>
              去修复
            </Link>
          )}
        </p>
      )}
      {!canPull && (
        <div className="flex flex-wrap gap-1">
          <LabelChip>由 AI 计划任务运行</LabelChip>
        </div>
      )}
    </div>
  )
}

export function ScheduledRuns() {
  const schedules = listedSchedules(useSchedules())
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
