import { describe, expect, it } from "vitest"

import { ACCOUNTS } from "@/data/accounts"
import type { Work, WorkStatus } from "@/data/types"
import { WORKS } from "@/data/works"
import { orderAccountWorks } from "./works-order"

const idsOf = (works: Work[]) => works.map((work) => work.id)

/** 造一个知乎作品：只写用得到的字段，其余用固定值 */
function makeWork(id: string, status: WorkStatus, patch: Partial<Work> = {}): Work {
  return {
    id,
    title: id,
    accountId: "zhihu-yiye",
    status,
    brief: "",
    source: { kind: "none" },
    workflowId: "zhihu-write",
    step: 0,
    order: 0,
    createdAt: "2026-10-01T09:00:00+08:00",
    updatedAt: "2026-10-01T09:00:00+08:00",
    tags: [],
    log: [],
    ...patch,
  }
}

describe("账号页的作品顺序：演示数据", () => {
  it("知乎共 22 个，前 8 个：两个等你处理、一个进行中、五个待实现", () => {
    const ordered = orderAccountWorks(WORKS, "zhihu-yiye")
    expect(ordered).toHaveLength(22)
    expect(idsOf(ordered).slice(0, 8)).toEqual([
      "z-leafpress-intro",
      "z-design-extraction",
      "z-reasoning",
      "z-fleet-truncation",
      "z-jev",
      "z-hourly-rate",
      "z-vacuum-into",
      "z-tunnel-access",
    ])
    expect(ordered.slice(0, 8).map((work) => work.status)).toEqual(["waiting", "waiting", "doing", "todo", "todo", "todo", "todo", "todo"])
  })

  it("每个账号的作品一个不少：知乎 22、博客 40、B站 1、小红书 1", () => {
    const counts = Object.fromEntries(ACCOUNTS.map((account) => [account.id, orderAccountWorks(WORKS, account.id).length]))
    expect(counts).toEqual({ "zhihu-yiye": 22, "blog-chaosyn": 40, "bili-yiye": 1, "xhs-yiye": 1 })
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(WORKS.length)
  })

  it("按状态分组：等你处理 → 进行中 → 待实现 → 已完成，已完成的排在最后", () => {
    const rank: Record<WorkStatus, number> = { waiting: 0, doing: 1, todo: 2, done: 3 }
    for (const account of ACCOUNTS) {
      const ranks = orderAccountWorks(WORKS, account.id).map((work) => rank[work.status])
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }
  })

  it("博客：一篇待实现排在 39 篇已发文章前面，已发的从新到旧", () => {
    const ordered = orderAccountWorks(WORKS, "blog-chaosyn")
    expect(ordered[0].status).toBe("todo")
    const days = ordered.slice(1).map((work) => work.publishedAt ?? "")
    expect(days).toHaveLength(39)
    expect(days).toEqual([...days].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)))
  })
})

describe("账号页的作品顺序：同一状态里怎么排", () => {
  it("等你处理、进行中：最近变动的在前，时间一样编号大的在前", () => {
    const works = [
      makeWork("w-a", "waiting", { updatedAt: "2026-10-02T09:00:00+08:00" }),
      makeWork("w-b", "waiting", { updatedAt: "2026-10-03T09:00:00+08:00" }),
      makeWork("w-c", "waiting", { updatedAt: "2026-10-03T09:00:00+08:00" }),
      makeWork("d-a", "doing", { updatedAt: "2026-10-05T09:00:00+08:00" }),
      makeWork("d-b", "doing", { updatedAt: "2026-10-06T09:00:00+08:00" }),
    ]
    expect(idsOf(orderAccountWorks(works, "zhihu-yiye"))).toEqual(["w-c", "w-b", "w-a", "d-b", "d-a"])
  })

  it("待实现：排队靠前的在前，排队位置一样先创建的在前", () => {
    const works = [
      makeWork("t-a", "todo", { order: 3 }),
      makeWork("t-b", "todo", { order: 1, createdAt: "2026-10-04T09:00:00+08:00" }),
      makeWork("t-c", "todo", { order: 1, createdAt: "2026-10-02T09:00:00+08:00" }),
      makeWork("t-d", "todo", { order: -1 }),
    ]
    expect(idsOf(orderAccountWorks(works, "zhihu-yiye"))).toEqual(["t-d", "t-c", "t-b", "t-a"])
  })

  it("已完成：发布日新的在前，同一天编号大的在前", () => {
    const works = [
      makeWork("p-a", "done", { publishedAt: "2026-09-01" }),
      makeWork("p-b", "done", { publishedAt: "2026-09-30" }),
      makeWork("p-c", "done", { publishedAt: "2026-09-30" }),
      makeWork("p-d", "done", { publishedAt: "2026-09-15" }),
    ]
    expect(idsOf(orderAccountWorks(works, "zhihu-yiye"))).toEqual(["p-c", "p-b", "p-d", "p-a"])
  })

  it("状态之间不看时间：很久以前的待实现也排在刚发的已完成前面", () => {
    const works = [
      makeWork("done-new", "done", { publishedAt: "2026-10-07", updatedAt: "2026-10-07T21:30:00+08:00" }),
      makeWork("todo-old", "todo", { updatedAt: "2026-01-01T09:00:00+08:00" }),
    ]
    expect(idsOf(orderAccountWorks(works, "zhihu-yiye"))).toEqual(["todo-old", "done-new"])
  })
})

describe("账号页的作品顺序：跟着页面上的改动走", () => {
  it("待实现的作品被挪到等你处理后，排到最前面", () => {
    const changed = WORKS.map((work) =>
      work.id === "z-jev" ? { ...work, status: "waiting" as const, updatedAt: "2026-10-09T09:00:00+08:00" } : work,
    )
    expect(idsOf(orderAccountWorks(changed, "zhihu-yiye")).slice(0, 4)).toEqual([
      "z-jev",
      "z-leafpress-intro",
      "z-design-extraction",
      "z-reasoning",
    ])
  })

  it("删掉一个作品，列表里就少一个", () => {
    const remaining = WORKS.filter((work) => work.id !== "z-jev")
    expect(orderAccountWorks(remaining, "zhihu-yiye")).toHaveLength(21)
  })

  it("只排这个账号的作品，不改传进来的数组", () => {
    const before = idsOf(WORKS)
    const ordered = orderAccountWorks(WORKS, "bili-yiye")
    expect(ordered.every((work) => work.accountId === "bili-yiye")).toBe(true)
    expect(idsOf(WORKS)).toEqual(before)
  })
})
