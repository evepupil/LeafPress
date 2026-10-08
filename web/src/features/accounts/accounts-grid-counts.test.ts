import { describe, expect, it } from "vitest"

import type { Work } from "@leafpress/core"
import { isIdle, taskCounts } from "./accounts-grid-counts"

function makeWork(id: string, accountId: string, status: Work["status"]): Work {
  return {
    id,
    title: id,
    accountId,
    status,
    brief: "",
    source: { kind: "none" },
    workflowId: "generic",
    step: 0,
    order: 0,
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-01T09:00:00Z",
    feedbackHistory: [],
    tags: [],
    log: [],
  }
}

const WORKS = [
  makeWork("a", "account-1", "todo"),
  makeWork("b", "account-1", "doing"),
  makeWork("c", "account-1", "waiting"),
  makeWork("d", "account-1", "done"),
  makeWork("e", "account-2", "waiting"),
]

describe("账号卡片上的手头作品计数", () => {
  it("按账号计数，并排除已完成作品", () => {
    expect(taskCounts(WORKS, "account-1")).toEqual({ todo: 1, doing: 1, waiting: 1 })
    expect(taskCounts(WORKS, "account-2")).toEqual({ todo: 0, doing: 0, waiting: 1 })
    expect(taskCounts(WORKS, "missing")).toEqual({ todo: 0, doing: 0, waiting: 0 })
  })
  it("只有三种未完成状态都是 0 才算空闲", () => {
    expect(isIdle({ todo: 0, doing: 0, waiting: 0 })).toBe(true)
    expect(isIdle({ todo: 0, doing: 0, waiting: 1 })).toBe(false)
    expect(isIdle(taskCounts([], "account-1"))).toBe(true)
  })
})
