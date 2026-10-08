import { describe, expect, it } from "vitest"

import type { Work } from "../types/index.ts"
import {
  EMPTY_FILTER,
  bottomOrder,
  countBy,
  derivedFrom,
  filterWorks,
  newWorkId,
  pickNext,
  reorderTodo,
  sortColumn,
  topOrder,
  workflowUsage,
} from "./board.ts"

const timestamp = "2026-10-08T09:00:00+08:00"
function work(id: string, status: Work["status"], fields: Partial<Work> = {}): Work {
  return {
    id,
    title: `作品 ${id}`,
    accountId: id.startsWith("b-") ? "blog-1" : "zhihu-1",
    status,
    brief: "Cloudflare guide",
    source: { kind: "none" },
    workflowId: "general-write",
    step: status === "done" ? 3 : 0,
    feedbackHistory: [],
    order: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
    log: [],
    ...fields,
  }
}

const works = [
  work("z-c", "todo", { order: 3, createdAt: "2026-10-07T09:00:00+08:00" }),
  work("z-a", "todo", { order: 1 }),
  work("z-b", "todo", { order: 2 }),
  work("z-do", "doing", { updatedAt: "2026-10-08T10:00:00+08:00" }),
  work("z-wait", "waiting"),
  work("z-old", "done", { publishedAt: "2026-10-01", updatedAt: "2026-10-08T11:00:00+08:00" }),
  work("z-new", "done", { publishedAt: "2026-10-07", updatedAt: "2026-10-07T11:00:00+08:00" }),
  work("b-done", "done", { publishedAt: "2026-10-07", updatedAt: "2026-10-07T11:00:00+08:00" }),
  work("z-derived", "todo", { order: 4, source: { kind: "work", workId: "z-a" } }),
]

describe("作品看板", () => {
  it("按三种列规则排序且不修改输入", () => {
    expect(sortColumn(works, "todo").map((item) => item.id)).toEqual(["z-a", "z-b", "z-c", "z-derived"])
    expect(sortColumn(works, "doing").map((item) => item.id)).toEqual(["z-do"])
    expect(sortColumn(works, "waiting").map((item) => item.id)).toEqual(["z-wait"])
    expect(sortColumn(works, "done").map((item) => item.id)).toEqual(["b-done", "z-new", "z-old"])
    expect(works[0]?.id).toBe("z-c")
  })

  it("平台、大小写关键字、编号过滤和计数", () => {
    const platformOf = (accountId: string): "blog" | "zhihu" | undefined =>
      accountId === "blog-1" ? "blog" : accountId === "zhihu-1" ? "zhihu" : undefined
    expect(filterWorks(works, { platform: "blog", query: "" }, platformOf).map((item) => item.id)).toEqual(["b-done"])
    expect(filterWorks(works, { platform: "all", query: "CLOUDFLARE" }, platformOf)).toHaveLength(9)
    expect(filterWorks(works, { platform: "zhihu", query: "z-derived" }, platformOf).map((item) => item.id)).toEqual(["z-derived"])
    expect(filterWorks(works, EMPTY_FILTER, platformOf)).toHaveLength(9)
    expect([countBy(works, "todo"), countBy(works, "doing"), countBy(works, "waiting"), countBy(works, "done")]).toEqual([4, 1, 1, 3])
  })

  it("重排待实现、空列 order 和挑选下一个", () => {
    expect([...reorderTodo(works, "z-c", "z-a")]).toEqual([
      ["z-c", 1],
      ["z-a", 2],
      ["z-b", 3],
      ["z-derived", 4],
    ])
    expect([...reorderTodo(works, "z-a", null)].at(-1)).toEqual(["z-a", 4])
    expect(topOrder([])).toBe(0)
    expect(bottomOrder([])).toBe(1)
    expect(topOrder(works)).toBe(0)
    expect(bottomOrder(works)).toBe(5)
    expect(pickNext(works, (item) => item.id !== "z-a")?.id).toBe("z-b")
  })

  it("待实现同序按创建时间；进行中和等你处理按更新时间倒序再按编号", () => {
    const cards = [
      work("doing-b", "doing", { updatedAt: "2026-10-08T10:00:00+08:00" }),
      work("doing-old", "doing", { updatedAt: "2026-10-08T09:00:00+08:00" }),
      work("doing-a", "doing", { updatedAt: "2026-10-08T10:00:00+08:00" }),
      work("waiting-b", "waiting", { updatedAt: "2026-10-08T09:30:00+08:00" }),
      work("waiting-new", "waiting", { updatedAt: "2026-10-08T11:00:00+08:00" }),
      work("waiting-a", "waiting", { updatedAt: "2026-10-08T09:30:00+08:00" }),
      work("todo-new", "todo", { order: 1, createdAt: "2026-10-09T09:00:00+08:00" }),
      work("todo-old", "todo", { order: 1, createdAt: "2026-10-07T09:00:00+08:00" }),
    ]
    expect(sortColumn(cards, "doing").map((item) => item.id)).toEqual(["doing-a", "doing-b", "doing-old"])
    expect(sortColumn(cards, "waiting").map((item) => item.id)).toEqual(["waiting-new", "waiting-a", "waiting-b"])
    expect(sortColumn(cards, "todo").map((item) => item.id)).toEqual(["todo-old", "todo-new"])
  })

  it("将等你处理的作品拖到待实现指定位置，并重编整列序号", () => {
    const works = [work("a", "todo", { order: 1 }), work("b", "todo", { order: 2 }), work("w", "waiting", { order: 8 })]
    expect([...reorderTodo(works, "w", "a")]).toEqual([
      ["w", 1],
      ["a", 2],
      ["b", 3],
    ])
  })

  it("工作流用量、来源作品和平台编号", () => {
    expect(workflowUsage(works, "general-write")).toEqual({ active: 6, done: 3 })
    expect(derivedFrom(works, "z-a").map((item) => item.id)).toEqual(["z-derived"])
    expect(newWorkId("zhihu", 12)).toBe("z-12")
    expect(newWorkId("bilibili", 13)).toBe("v-13")
  })
})
