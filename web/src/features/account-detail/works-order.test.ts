import { describe, expect, it } from "vitest"

import type { Work } from "@leafpress/core"
import { orderAccountWorks } from "./works-order"

function makeWork(id: string, status: Work["status"], patch: Partial<Work> = {}): Work {
  return {
    id,
    title: id,
    accountId: "account-1",
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
    ...patch,
  }
}
const idsOf = (works: Work[]) => works.map((work) => work.id)

describe("账号页作品顺序", () => {
  it("按状态分组，并复用 core 看板的列内排序", () => {
    const works = [
      makeWork("done-old", "done", { publishedAt: "2026-09-01" }),
      makeWork("todo-late", "todo", { order: 2 }),
      makeWork("waiting-old", "waiting", { updatedAt: "2026-10-01T09:00:00Z" }),
      makeWork("todo-first", "todo", { order: 1 }),
      makeWork("doing-new", "doing", { updatedAt: "2026-10-03T09:00:00Z" }),
      makeWork("waiting-new", "waiting", { updatedAt: "2026-10-04T09:00:00Z" }),
      makeWork("done-new", "done", { publishedAt: "2026-10-01" }),
      makeWork("other", "todo", { accountId: "account-2" }),
    ]
    expect(idsOf(orderAccountWorks(works, "account-1"))).toEqual([
      "waiting-new",
      "waiting-old",
      "doing-new",
      "todo-first",
      "todo-late",
      "done-new",
      "done-old",
    ])
  })
  it("不修改输入并只返回指定账号的作品", () => {
    const works = [makeWork("one", "todo"), makeWork("two", "done", { accountId: "account-2" })]
    const before = [...works]
    expect(orderAccountWorks(works, "account-1")).toEqual([works[0]])
    expect(works).toEqual(before)
  })
})
