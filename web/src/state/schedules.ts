"use client"

import { create } from "zustand"

import { SCHEDULED } from "@/data/workflows"
import type { ScheduledWorkflow } from "@/data/types"

/** 定时工作流最近一次运行。「现在跑一次」会改这里，刷新复原 */
type LastRun = Pick<ScheduledWorkflow, "lastRunAt" | "lastResult" | "lastNote">

interface SchedulesState {
  runs: Record<string, LastRun>
  record(id: string, run: LastRun): void
}

export const useSchedules = create<SchedulesState>((set) => ({
  runs: Object.fromEntries(
    SCHEDULED.map((item) => [item.id, { lastRunAt: item.lastRunAt, lastResult: item.lastResult, lastNote: item.lastNote }]),
  ),
  record: (id, run) => set((state) => ({ runs: { ...state.runs, [id]: run } })),
}))
