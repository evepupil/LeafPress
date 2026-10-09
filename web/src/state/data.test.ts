import { afterEach, describe, expect, it, vi } from "vitest"

import type { Bootstrap, MetricsDataset, Version } from "@leafpress/core"
import { useData, versionChanges } from "./data"

function version(seq: number): Version {
  return { seq, snapshotSeq: seq, profilesStamp: seq }
}

function bootstrap(current: Version): Bootstrap {
  return {
    now: "2026-10-01T09:00:00Z",
    today: "2026-10-01",
    version: current,
    paths: { home: "/tmp/home", tasks: "/tmp/tasks", accounts: "/tmp/accounts", backups: "/tmp/backups" },
    works: [],
    ideas: [],
    accounts: [],
    pulls: [],
    notes: [],
    schedules: [],
  }
}

function dataset(seq: number): MetricsDataset {
  const today = `2026-10-${String(seq).padStart(2, "0")}`
  return { today, latestDay: today, daily: {}, lastDays: {}, workDays: {} }
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  useData.setState({
    status: "loading",
    error: undefined,
    reconnecting: false,
    consecutiveFailures: 0,
    boot: undefined,
    dataset: undefined,
    datasetVersion: undefined,
    version: undefined,
  })
})

describe("version refresh selection", () => {
  const previous: Version = { seq: 4, snapshotSeq: 7, profilesStamp: 2 }

  it("refreshes bootstrap when seq changes", () => {
    expect(versionChanges(previous, { ...previous, seq: 5 })).toEqual({ bootstrap: true, dataset: false })
  })

  it("refreshes only the dataset when snapshotSeq changes", () => {
    expect(versionChanges(previous, { ...previous, snapshotSeq: 8 })).toEqual({ bootstrap: false, dataset: true })
  })

  it("refreshes only bootstrap when profilesStamp changes", () => {
    expect(versionChanges(previous, { ...previous, profilesStamp: 3 })).toEqual({ bootstrap: true, dataset: false })
  })

  it("does not refresh when the version is unchanged", () => {
    expect(versionChanges(previous, previous)).toEqual({ bootstrap: false, dataset: false })
  })
})

describe("data synchronization", () => {
  it("keeps the loaded snapshot while reporting repeated sync failures", async () => {
    const serverVersion = version(1)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        if (path.endsWith("/api/version")) return json(serverVersion)
        if (path.endsWith("/api/bootstrap")) return json(bootstrap(serverVersion))
        if (path.endsWith("/api/dataset")) return json(dataset(serverVersion.snapshotSeq))
        throw new Error(`Unexpected request: ${path}`)
      }),
    )
    await useData.getState().load()
    const loadedBoot = useData.getState().boot
    const loadedDataset = useData.getState().dataset

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    )
    await useData.getState().sync()
    expect(useData.getState().error).toBeUndefined()
    await useData.getState().sync()

    expect(useData.getState().status).toBe("ready")
    expect(useData.getState().error?.message).toBe("连接本机服务失败")
    expect(useData.getState().boot).toBe(loadedBoot)
    expect(useData.getState().dataset).toBe(loadedDataset)
  })

  it("keeps a successful bootstrap when the dataset endpoint fails", async () => {
    const serverVersion = version(1)
    let failDataset = true
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        if (path.endsWith("/api/version")) return json(serverVersion)
        if (path.endsWith("/api/bootstrap")) return json(bootstrap(serverVersion))
        if (path.endsWith("/api/dataset")) {
          if (failDataset) throw new Error("Failed to fetch")
          return json(dataset(serverVersion.snapshotSeq))
        }
        throw new Error(`Unexpected request: ${path}`)
      }),
    )

    await useData.getState().load()
    expect(useData.getState().boot?.version.seq).toBe(1)
    expect(useData.getState().dataset).toBeUndefined()
    expect(useData.getState().consecutiveFailures).toBe(1)
    expect(useData.getState().error).toBeUndefined()

    failDataset = false
    await useData.getState().sync()
    expect(useData.getState().dataset?.latestDay).toBe("2026-10-01")
    expect(useData.getState().consecutiveFailures).toBe(0)
    expect(useData.getState().error).toBeUndefined()
  })

  it("does not reuse an in-flight dataset request below the requested version", async () => {
    let serverVersion = version(1)
    let releaseOldDataset: (() => void) | undefined
    let markOldDatasetStarted: (() => void) | undefined
    const oldDatasetStarted = new Promise<void>((resolve) => {
      markOldDatasetStarted = resolve
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        if (path.endsWith("/api/version")) return json(serverVersion)
        if (path.endsWith("/api/bootstrap")) return json(bootstrap(serverVersion))
        if (path.endsWith("/api/dataset") && serverVersion.seq === 2) {
          markOldDatasetStarted?.()
          return new Promise<Response>((resolve) => {
            releaseOldDataset = () => resolve(json(dataset(2)))
          })
        }
        if (path.endsWith("/api/dataset")) return json(dataset(serverVersion.snapshotSeq))
        throw new Error(`Unexpected request: ${path}`)
      }),
    )

    await useData.getState().load()
    serverVersion = version(2)
    const olderSync = useData.getState().sync()
    await oldDatasetStarted

    serverVersion = version(3)
    await useData.getState().sync(serverVersion)
    releaseOldDataset?.()
    await olderSync

    expect(useData.getState().boot?.version.seq).toBe(3)
    expect(useData.getState().dataset?.latestDay).toBe("2026-10-03")
    expect(useData.getState().datasetVersion?.snapshotSeq).toBe(3)
  })
})
