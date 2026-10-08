"use client"

import { History } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { DEMO_NOW } from "@/data/clock"
import { RUNS } from "@/data/tools"
import type { ToolRun } from "@/data/types"
import { backfillRun, confirmRun, retryRun } from "./run-list-actions"
import { RUN_FILTER_OPTIONS, filterRuns, findRunId, parseRunFilter, type RunFilter } from "./run-list-model"
import { RunRow } from "./run-list-row"
import { RunSheet } from "./run-list-sheet"

/** 确认完以后的提示，按工具区分 */
const CONFIRM_TOAST: Partial<Record<string, string>> = {
  "video-pipeline": "字幕已确认，继续出片",
  "zhihu-writing": "大纲已确认，开始写全文",
}

/**
 * 运行记录：按状态筛选的列表，点一行从右边滑出详情。
 * 抽屉里的回填、确认、重试改的是本组件里的一份拷贝，刷新就复原。
 */
export function RunList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stateParam = searchParams.get("state")
  const runParam = searchParams.get("run")

  const [runs, setRuns] = useState<ToolRun[]>(() => structuredClone(RUNS))
  const [filter, setFilter] = useState<RunFilter>(() => parseRunFilter(stateParam) ?? "all")
  const [openId, setOpenId] = useState<string | null>(() => findRunId(runs, runParam))
  const [backfill, setBackfill] = useState("")

  // 进页面时读一次地址栏（上面的初始值）。之后地址栏变了也要跟着变：
  // 在本页点工具卡片里的「最近一次运行」、侧栏的「等我处理」，页面不会重新挂载，只有地址栏参数在变。
  // state 参数变空不改筛选（关抽屉会清掉地址栏，不该顺带把筛选重置）；run 参数变空则关掉抽屉。
  const [seenStateParam, setSeenStateParam] = useState(stateParam)
  if (stateParam !== seenStateParam) {
    setSeenStateParam(stateParam)
    const next = parseRunFilter(stateParam)
    if (next) setFilter(next)
  }
  const [seenRunParam, setSeenRunParam] = useState(runParam)
  if (runParam !== seenRunParam) {
    setSeenRunParam(runParam)
    setOpenId(findRunId(runs, runParam))
    setBackfill("")
  }

  const visible = filterRuns(runs, filter)
  const openRun = runs.find((run) => run.id === openId) ?? null

  function openRunById(id: string) {
    setBackfill("")
    setOpenId(id)
  }

  function closeRun() {
    setOpenId(null)
    setBackfill("")
    // 地址栏带着参数时一起清掉；scroll: false 避免页面跳回顶部
    if (searchParams.toString()) router.replace("/tools/", { scroll: false })
  }

  /** 改抽屉里正在看的那条运行 */
  function updateOpenRun(update: (run: ToolRun) => ToolRun) {
    if (!openRun) return
    setRuns((prev) => prev.map((run) => (run.id === openRun.id ? update(run) : run)))
  }

  function submitBackfill() {
    if (!backfill.trim()) return
    updateOpenRun((run) => backfillRun(run, DEMO_NOW))
    setBackfill("")
    toast.success("已登记，知乎版本改为已发")
  }

  function confirmWaiting() {
    if (!openRun) return
    updateOpenRun((run) => confirmRun(run, DEMO_NOW))
    toast.success(CONFIRM_TOAST[openRun.toolId] ?? "已确认")
  }

  function retryFailed() {
    updateOpenRun(retryRun)
    toast("已重新开始")
  }

  return (
    <section id="runs" aria-labelledby="runs-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <History className="size-4 text-fg-2" aria-hidden />
        <h2 id="runs-title" className="text-sm font-medium">
          运行记录
        </h2>
        <span className="text-sm text-fg-2 tabular" data-runs-count>
          {visible.length}
        </span>
        <div className="ml-auto" data-runs-filter>
          <Segmented label="按状态筛选" value={filter} onChange={setFilter} options={RUN_FILTER_OPTIONS} />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={History} title="没有这一类运行" />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((run) => (
            <RunRow key={run.id} run={run} onOpen={openRunById} />
          ))}
        </ul>
      )}

      <RunSheet
        run={openRun}
        backfill={backfill}
        onBackfillChange={setBackfill}
        onBackfill={submitBackfill}
        onConfirm={confirmWaiting}
        onRetry={retryFailed}
        onClose={closeRun}
      />
    </section>
  )
}

export default RunList
