import { describe, expect, it } from "vitest"

import { ACCOUNTS } from "@/data/accounts"
import type { Work, WorkStatus } from "@/data/types"
import { WORKS } from "@/data/works"
import { isIdle, taskCounts } from "./accounts-grid-counts"

/** 造一个作品：只写用得到的字段，其余用固定值 */
function makeWork(id: string, accountId: string, status: WorkStatus): Work {
  return {
    id,
    title: id,
    accountId,
    columnId: "ai-eng",
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
  }
}

describe("账号卡片上的「手上的活」", () => {
  it("初始数据：知乎 5·1·2，博客 1·0·0，B站 0·0·1，小红书 0·0·1", () => {
    const counts = Object.fromEntries(ACCOUNTS.map((account) => [account.id, taskCounts(WORKS, account.id)]))
    expect(counts).toEqual({
      "zhihu-yiye": { todo: 5, doing: 1, waiting: 2 },
      "blog-chaosyn": { todo: 1, doing: 0, waiting: 0 },
      "bili-yiye": { todo: 0, doing: 0, waiting: 1 },
      "xhs-yiye": { todo: 0, doing: 0, waiting: 1 },
    })
  })

  it("已完成的不算，别的账号的不算", () => {
    const works = [makeWork("a", "zhihu-yiye", "done"), makeWork("b", "zhihu-yiye", "todo"), makeWork("c", "blog-chaosyn", "waiting")]
    expect(taskCounts(works, "zhihu-yiye")).toEqual({ todo: 1, doing: 0, waiting: 0 })
    expect(taskCounts(works, "xhs-yiye")).toEqual({ todo: 0, doing: 0, waiting: 0 })
  })

  it("跟着作品状态变：待实现的作品交给 AI 后，数字从待实现挪到进行中", () => {
    const changed = WORKS.map((work) => (work.id === "z-jev" ? { ...work, status: "doing" as const } : work))
    expect(taskCounts(changed, "zhihu-yiye")).toEqual({ todo: 4, doing: 2, waiting: 2 })
  })

  it("三种都是 0 才算没有活，只要有一种不是 0 就不算", () => {
    expect(isIdle({ todo: 0, doing: 0, waiting: 0 })).toBe(true)
    expect(isIdle({ todo: 0, doing: 0, waiting: 1 })).toBe(false)
    expect(isIdle({ todo: 3, doing: 0, waiting: 0 })).toBe(false)
    expect(isIdle(taskCounts([], "zhihu-yiye"))).toBe(true)
  })
})
