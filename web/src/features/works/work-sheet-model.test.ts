import { describe, expect, it } from "vitest"

import type { Work, WorkLog } from "@leafpress/core"
import { newestFirst, timeText } from "./work-sheet-model"

const log: WorkLog[] = [
  { at: "2026-10-06T21:10:00+08:00", text: "创建" },
  { at: "2026-10-06T21:24:00+08:00", text: "完成：改写" },
  { at: "2026-10-06T21:24:00+08:00", text: "等你：发布" },
  { at: "2026-10-06T21:05:00+08:00", text: "更早的一条" },
]
function work(status: Work["status"], extra: Partial<Work> = {}): Work {
  return {
    id: "work-1",
    title: "测试作品",
    accountId: "blog-1",
    status,
    brief: "",
    source: { kind: "none" },
    workflowId: "general-write",
    step: 0,
    order: 1,
    createdAt: "2026-10-06T21:10:00+08:00",
    updatedAt: "2026-10-06T21:10:00+08:00",
    feedbackHistory: [],
    tags: [],
    log,
    ...extra,
  }
}

describe("作品记录", () => {
  it("按时间倒序，同一时刻后写的在前，并记录原索引", () => {
    const rows = newestFirst(log)
    expect(rows.map((row) => row.entry.text)).toEqual(["等你：发布", "完成：改写", "创建", "更早的一条"])
    expect(rows.map((row) => row.index)).toEqual([2, 1, 0, 3])
  })
  it("排序不改原记录", () => {
    const before = log.map((entry) => entry.text)
    newestFirst(log)
    expect(log.map((entry) => entry.text)).toEqual(before)
  })
})

describe("作品时间", () => {
  it("已完成作品显示发布日期，其他状态不显示发布日期", () => {
    const done = work("done", { publishedAt: "2026-10-08" })
    expect(timeText(done, "2026-10-08", "2026-10-08T12:00:00+08:00")).toContain("发布 10月8日")
    const todo = work("todo")
    expect(timeText(todo, "2026-10-08", "2026-10-08T12:00:00+08:00")).toMatch(/^创建 /)
    expect(timeText(todo, "2026-10-08", "2026-10-08T12:00:00+08:00")).not.toContain("发布")
  })
})
