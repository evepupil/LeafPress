"use client"

import {
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

import { ApiError, getJson } from "./api"
import { useToday as useLocalToday } from "@/lib/local-clock"

export interface DataState {
  status: "loading" | "ready" | "error"
  error?: { message: string; hint?: string }
  reconnecting: boolean
  consecutiveFailures: number
  boot?: Bootstrap
  dataset?: MetricsDataset
  datasetVersion?: Version
  version?: Version
  load(): Promise<void>
  sync(next?: Version, force?: boolean): Promise<void>
  patchBoot(fn: (boot: Bootstrap) => Bootstrap): void
}

type Endpoint = "version" | "bootstrap" | "dataset"
interface InFlightRequest {
  promise: Promise<unknown>
  target?: Version
}
const inFlight: Partial<Record<Endpoint, InFlightRequest>> = {}
const requestIds: Record<Endpoint, number> = { version: 0, bootstrap: 0, dataset: 0 }
let syncId = 0

class SupersededRequest extends Error {}

function apiError(error: unknown): { message: string; hint?: string } {
  if (error instanceof ApiError) {
    return { message: error.message, ...(error.hint ? { hint: error.hint } : {}) }
  }
  return { message: "连接本机服务失败" }
}

export interface VersionChanges {
  bootstrap: boolean
  dataset: boolean
}

export function versionChanges(previous: Version | undefined, next: Version): VersionChanges {
  return {
    bootstrap: !previous || previous.seq !== next.seq || previous.profilesStamp !== next.profilesStamp,
    dataset: !previous || previous.snapshotSeq !== next.snapshotSeq,
  }
}

type RequestResult<T> = { ok: true; value: T } | { ok: false; error: unknown }

async function capture<T>(request: Promise<T>): Promise<RequestResult<T>> {
  try {
    return { ok: true, value: await request }
  } catch (error) {
    if (error instanceof SupersededRequest) throw error
    return { ok: false, error }
  }
}

function targetCovers(key: Endpoint, pending: Version | undefined, target: Version | undefined): boolean {
  if (key === "version" || !target) return true
  if (!pending) return false
  if (key === "dataset") return pending.snapshotSeq >= target.snapshotSeq
  return pending.seq >= target.seq && pending.profilesStamp >= target.profilesStamp
}

function requestLatest<T>(key: Endpoint, read: () => Promise<T>, force: boolean, target?: Version): Promise<T> {
  const pending = inFlight[key]
  if (pending && !force && targetCovers(key, pending.target, target)) return pending.promise as Promise<T>

  const id = ++requestIds[key]
  const request = read()
    .then((value) => {
      if (id !== requestIds[key]) throw new SupersededRequest()
      return value
    })
    .finally(() => {
      if (inFlight[key]?.promise === request) delete inFlight[key]
    })
  inFlight[key] = { promise: request, ...(target ? { target } : {}) }
  return request
}

async function fetchVersion(): Promise<Version> {
  return getJson<Version>("/api/version")
}

async function fetchBootstrap(): Promise<Bootstrap> {
  return getJson<Bootstrap>("/api/bootstrap")
}

async function fetchDataset(): Promise<MetricsDataset> {
  return getJson<MetricsDataset>("/api/dataset")
}

export const useData = create<DataState>((set, get) => ({
  status: "loading",
  reconnecting: false,
  consecutiveFailures: 0,
  load: async () => get().sync(undefined, true),
  sync: async (next, force = false) => {
    const request = ++syncId
    set((state) => ({ reconnecting: state.error !== undefined }))

    const recordFailure = (error: unknown) => {
      if (request !== syncId || error instanceof SupersededRequest) return
      set((state) => {
        const consecutiveFailures = state.consecutiveFailures + 1
        return {
          status: state.boot ? "ready" : consecutiveFailures >= 2 ? "error" : "loading",
          ...(consecutiveFailures >= 2 ? { error: apiError(error) } : {}),
          reconnecting: false,
          consecutiveFailures,
        }
      })
    }

    try {
      const observed = next ?? (await requestLatest("version", fetchVersion, force))
      if (request !== syncId) return

      const changes = versionChanges(get().version, observed)
      set({ version: observed })
      const latest = get()
      const needsBoot =
        force ||
        changes.bootstrap ||
        !latest.boot ||
        latest.boot.version.seq !== observed.seq ||
        latest.boot.version.profilesStamp !== observed.profilesStamp
      const needsDataset = force || changes.dataset || !latest.dataset || latest.datasetVersion?.snapshotSeq !== observed.snapshotSeq
      const [bootResult, datasetResult] = await Promise.all([
        needsBoot ? capture(requestLatest("bootstrap", fetchBootstrap, force, observed)) : Promise.resolve(undefined),
        needsDataset ? capture(requestLatest("dataset", fetchDataset, force, observed)) : Promise.resolve(undefined),
      ])
      if (request !== syncId) return

      const boot = bootResult?.ok ? bootResult.value : undefined
      const dataset = datasetResult?.ok ? datasetResult.value : undefined
      const failed = Boolean((bootResult && !bootResult.ok) || (datasetResult && !datasetResult.ok))
      const failure = bootResult && !bootResult.ok ? bootResult.error : datasetResult && !datasetResult.ok ? datasetResult.error : undefined
      set((state) => {
        const consecutiveFailures = failed ? state.consecutiveFailures + 1 : 0
        return {
          ...(boot ? { boot } : {}),
          ...(dataset ? { dataset, datasetVersion: observed } : {}),
          version: observed,
          status: state.boot || boot ? "ready" : failed ? (consecutiveFailures >= 2 ? "error" : "loading") : state.status,
          ...(failed ? (consecutiveFailures >= 2 ? { error: apiError(failure) } : {}) : { error: undefined }),
          reconnecting: false,
          consecutiveFailures,
        }
      })
    } catch (error) {
      recordFailure(error)
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
  return useLocalToday()
}

export function useMetricsInput(): MetricsInput | undefined {
  const [dataset, accounts, works] = useData(useShallow((state) => [state.dataset, state.boot?.accounts, state.boot?.works] as const))
  return useMemo(() => (dataset && accounts && works ? { dataset, accounts, works } : undefined), [dataset, accounts, works])
}
