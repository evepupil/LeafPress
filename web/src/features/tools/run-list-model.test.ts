import { describe, expect, it } from "vitest"

import { RUNS } from "@/data/tools"
import { filterRuns, findRunId, parseRunFilter, stepCounts } from "./run-list-model"

describe("运行记录筛选", () => {
  it("各个筛选下的条数：全部 11、等你处理 4、运行中 1、失败 2", () => {
    expect(filterRuns(RUNS, "all")).toHaveLength(11)
    expect(filterRuns(RUNS, "waiting")).toHaveLength(4)
    expect(filterRuns(RUNS, "running")).toHaveLength(1)
    expect(filterRuns(RUNS, "failed")).toHaveLength(2)
  })

  it("筛出来的运行状态都一致，顺序保持原来的新到旧", () => {
    const waiting = filterRuns(RUNS, "waiting")
    expect(waiting.every((run) => run.state === "waiting")).toBe(true)
    expect(waiting.map((run) => run.id)).toEqual(["run-06", "run-05", "run-02", "run-01"])
  })
})

describe("地址栏参数", () => {
  it("state 只认等你处理、运行中、失败三种", () => {
    expect(parseRunFilter("waiting")).toBe("waiting")
    expect(parseRunFilter("running")).toBe("running")
    expect(parseRunFilter("failed")).toBe("failed")
    expect(parseRunFilter("done")).toBeNull()
    expect(parseRunFilter("all")).toBeNull()
    expect(parseRunFilter(null)).toBeNull()
  })

  it("run 只有指向存在的运行才算数", () => {
    expect(findRunId(RUNS, "run-05")).toBe("run-05")
    expect(findRunId(RUNS, "run-99")).toBeNull()
    expect(findRunId(RUNS, null)).toBeNull()
  })
})

describe("步骤进度", () => {
  function counts(id: string) {
    const run = RUNS.find((item) => item.id === id)
    if (!run) throw new Error(`没有这条运行：${id}`)
    return stepCounts(run)
  }

  it("录屏成片 3/7，博客改投知乎的新一次 1/6，已完成的周报 4/4", () => {
    expect(counts("run-02")).toEqual({ done: 3, total: 7 })
    expect(counts("run-09")).toEqual({ done: 1, total: 6 })
    expect(counts("run-04")).toEqual({ done: 4, total: 4 })
  })
})
