"use client"

import { formatRelative, IDEA_SOURCE_LABEL, type IdeaSource } from "@leafpress/core"
import { Sparkles } from "lucide-react"
import { useMemo } from "react"

import { LabelChip } from "@/components/base/label-chip"
import { RunResultIcon } from "@/components/base/state-icons"
import { useData, useIdeas, useSchedules } from "@/state/data"

const SOURCES = Object.keys(IDEA_SOURCE_LABEL) as IdeaSource[]

function sourceMix(ideas: ReturnType<typeof useIdeas>): string {
  const counts = new Map<IdeaSource, number>()
  for (const idea of ideas) counts.set(idea.source, (counts.get(idea.source) ?? 0) + 1)
  return SOURCES.filter((source) => counts.has(source))
    .map((source) => `${IDEA_SOURCE_LABEL[source]} ${counts.get(source) ?? 0}`)
    .join(" · ")
}

export function IdeaHarvest() {
  const ideas = useIdeas()
  const schedule = useSchedules().find((item) => item.id === "idea-harvest")
  const now = useData((state) => state.boot?.now)
  const mix = useMemo(() => sourceMix(ideas), [ideas])

  if (!schedule) return null

  return (
    <section id="harvest" aria-labelledby="harvest-title" className="rounded-lg border border-line bg-card shadow-sm">
      <div className="flex min-h-10 items-center gap-2 border-b border-line px-3 py-2">
        <Sparkles className="size-4 shrink-0 text-fg-2" aria-hidden />
        <h2 id="harvest-title" className="text-sm font-medium">
          跑灵感
        </h2>
        <span className="ml-auto text-xs text-fg-2 tabular">{schedule.when}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          {schedule.lastResult && <RunResultIcon result={schedule.lastResult} />}
          <span className="min-w-0 truncate text-fg-2">
            {schedule.lastRunAt && now ? formatRelative(schedule.lastRunAt, now) : "尚无运行记录"}
            {schedule.lastNote && <span data-harvest-note> · {schedule.lastNote}</span>}
          </span>
          <LabelChip>{schedule.installed ? "已安装" : "未安装"}</LabelChip>
        </div>
        <p className="text-xs text-fg-2">采集任务由计划任务执行</p>
        {mix && (
          <p className="text-xs text-fg-2 tabular" data-source-mix>
            {mix}
          </p>
        )}
      </div>
    </section>
  )
}

export default IdeaHarvest
