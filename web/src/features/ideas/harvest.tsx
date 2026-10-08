"use client"

import { RefreshCw, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { LabelChip } from "@/components/base/label-chip"
import { RunResultIcon, Spinner } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { IDEA_SOURCE_LABEL } from "@/data/labels"
import type { Idea, IdeaSource } from "@/data/types"
import { SCHEDULED } from "@/data/workflows"
import { formatRelative } from "@/lib/format"
import { runSchedule } from "@/state/actions"
import { useIdeas } from "@/state/ideas"
import { useSchedules } from "@/state/schedules"

const HARVEST_ID = "idea-harvest"
/** 点了「现在跑一次」后转圈的时间 */
const RUN_MS = 800

const HARVEST = SCHEDULED.find((item) => item.id === HARVEST_ID)
/** 扫哪些地方：步骤的前三个，最后一步是写进收件箱 */
const PLACES = HARVEST?.steps.slice(0, 3) ?? []
/** 来源的显示顺序跟着 IDEA_SOURCE_LABEL 的书写顺序 */
const SOURCES = Object.keys(IDEA_SOURCE_LABEL) as IdeaSource[]

/** 当前全部灵感按来源数一遍，只列有的：「随手记 6 · 开发记录 5」 */
function sourceMix(ideas: Idea[]): string {
  const counts = new Map<IdeaSource, number>()
  for (const idea of ideas) counts.set(idea.source, (counts.get(idea.source) ?? 0) + 1)
  return SOURCES.filter((source) => counts.has(source))
    .map((source) => `${IDEA_SOURCE_LABEL[source]} ${counts.get(source) ?? 0}`)
    .join(" · ")
}

/** 定时工作流「跑灵感」：最近一次的结果、扫哪些地方、现有灵感来自哪里，以及现在跑一次 */
export function IdeaHarvest() {
  const ideas = useIdeas((state) => state.ideas)
  const last = useSchedules((state) => state.runs[HARVEST_ID])
  const [running, setRunning] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mix = useMemo(() => sourceMix(ideas), [ideas])

  // 离开页面时清掉还没到点的计时，免得回来之后凭空多出灵感
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const run = () => {
    if (running) return
    setRunning(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setRunning(false)
      toast(runSchedule(HARVEST_ID))
    }, RUN_MS)
  }

  return (
    <section id="harvest" aria-labelledby="harvest-title" className="rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Sparkles className="size-4 text-fg-2" aria-hidden />
        <h2 id="harvest-title" className="text-sm font-medium">
          跑灵感
        </h2>
        {HARVEST && <span className="text-xs text-fg-2 tabular">{HARVEST.schedule}</span>}
        <Button size="sm" variant="outline" className="ml-auto" data-harvest-run disabled={running} onClick={run}>
          {running ? <Spinner /> : <RefreshCw />}
          现在跑一次
        </Button>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <RunResultIcon result={last.lastResult} />
          <span className="shrink-0 tabular">{formatRelative(last.lastRunAt)}</span>
          <span aria-hidden className="text-fg-2">
            ·
          </span>
          <span className="min-w-0 truncate tabular" data-harvest-note>
            {last.lastNote}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {PLACES.map((place) => (
            <LabelChip key={place}>{place}</LabelChip>
          ))}
        </div>
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
