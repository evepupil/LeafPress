"use client"

import {
  dayOfDate,
  type Account,
  type Bootstrap,
  type DayKey,
  type Idea,
  type MetricsDataset,
  type MetricsInput,
  type PullRecord,
  type ScheduleView,
  type Version,
  type WeeklyNote,
  type Work,
} from "@leafpress/core"
import { useMemo } from "react"
import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

import { getJson } from "./api"

export interface DataState {
  status: "loading" | "ready" | "error"
  error?: { message: string; hint?: string }
  boot?: Bootstrap
  dataset?: MetricsDataset
  version?: Version
  load(): Promise<void>
  sync(next?: Version, force?: boolean): Promise<void>
  patchBoot(fn: (boot: Bootstrap) => Bootstrap): void
}

function apiError(error: unknown): { message: string; hint?: string } {
  if (error instanceof Error) {
    const hint = "hint" in error && typeof error.hint === "string" ? error.hint : undefined
    return { message: error.message, ...(hint ? { hint } : {}) }
  }
  return { message: "连接本机服务失败" }
}

async function fetchBootstrap(): Promise<Bootstrap> {
  return getJson<Bootstrap>("/api/bootstrap")
}

async function fetchDataset(): Promise<MetricsDataset> {
  return getJson<MetricsDataset>("/api/dataset")
}

export const useData = create<DataState>((set, get) => ({
  status: "loading",
  load: async () => {
    set({ status: "loading", error: undefined })
    try {
      const [boot, dataset] = await Promise.all([fetchBootstrap(), fetchDataset()])
      set({ boot, dataset, version: boot.version, status: "ready", error: undefined })
    } catch (error) {
      set({ status: "error", error: apiError(error) })
    }
  },
  sync: async (next, force = false) => {
    const state = get()
    const current = state.version ?? state.boot?.version
    const needsBoot =
      force || !state.boot || !current || (next !== undefined && (next.seq !== current.seq || next.profilesStamp !== current.profilesStamp))
    const needsDataset = force || !state.dataset || (next !== undefined && (!current || next.snapshotSeq !== current.snapshotSeq))
    try {
      const [boot, dataset] = await Promise.all([
        needsBoot ? fetchBootstrap() : Promise.resolve(undefined),
        needsDataset ? fetchDataset() : Promise.resolve(undefined),
      ])
      set((latest) => ({
        ...(boot ? { boot, version: boot.version } : {}),
        ...(dataset ? { dataset } : {}),
        ...(next ? { version: boot?.version ?? next } : {}),
        status: "ready",
        error: undefined,
        ...(latest.boot && !boot && next ? { boot: { ...latest.boot, version: next } } : {}),
      }))
    } catch (error) {
      set({ status: "error", error: apiError(error) })
    }
  },
  patchBoot: (fn) => set((state) => (state.boot ? { boot: fn(state.boot) } : {})),
}))

const NO_WORKS: Work[] = []
const NO_IDEAS: Idea[] = []
const NO_ACCOUNTS: Account[] = []
const NO_PULLS: PullRecord[] = []
const NO_NOTES: WeeklyNote[] = []
const NO_SCHEDULES: ScheduleView[] = []
const LOCAL_TODAY: DayKey = dayOfDate(new Date())

export function useWorks(): Work[] {
  return useData((state) => state.boot?.works ?? NO_WORKS)
}

export function useIdeas(): Idea[] {
  return useData((state) => state.boot?.ideas ?? NO_IDEAS)
}

export function useAccounts(): Account[] {
  return useData((state) => state.boot?.accounts ?? NO_ACCOUNTS)
}

export function useAccount(id: string | undefined): Account | undefined {
  return useData((state) => (id ? state.boot?.accounts.find((account) => account.id === id) : undefined))
}

export function usePulls(): PullRecord[] {
  return useData((state) => state.boot?.pulls ?? NO_PULLS)
}

export function useNotes(): WeeklyNote[] {
  return useData((state) => state.boot?.notes ?? NO_NOTES)
}

export function useSchedules(): ScheduleView[] {
  return useData((state) => state.boot?.schedules ?? NO_SCHEDULES)
}

export function usePaths() {
  return useData((state) => state.boot?.paths)
}

export function useToday(): DayKey {
  return useData((state) => state.boot?.today ?? LOCAL_TODAY)
}

export function useMetricsInput(): MetricsInput | undefined {
  const [dataset, accounts, works] = useData(useShallow((state) => [state.dataset, state.boot?.accounts, state.boot?.works] as const))
  return useMemo(() => (dataset && accounts && works ? { dataset, accounts, works } : undefined), [dataset, accounts, works])
}
