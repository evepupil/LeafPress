import { describe, expect, it } from "vitest"

import type { Idea } from "../types/index.ts"
import { markConverted, moveIdea, newIdeaId, reorderIdeas, sortIdeas, topIdeaOrder, updateIdea } from "./index.ts"

const at = "2026-10-08T09:30:00+08:00"
function idea(id: string, status: Idea["status"], order: number, createdAt = at): Idea {
  return {
    id,
    text: `灵感 ${id}`,
    detail: "展开说明",
    status,
    source: "quick",
    accountId: "zhihu-1",
    order,
    createdAt,
    updatedAt: at,
    workIds: [],
  }
}
const ideas = [
  idea("i-2", "inbox", 2),
  idea("i-1", "inbox", 1),
  idea("i-recent", "inbox", 1, "2026-10-09T09:00:00+08:00"),
  idea("i-3", "promising", 1),
  idea("i-4", "converted", 3),
]

describe("灵感规则", () => {
  it("排序、拖动换列目标顺序、空列排序和新编号", () => {
    expect(sortIdeas(ideas, "inbox").map((item) => item.id)).toEqual(["i-recent", "i-1", "i-2"])
    expect([...reorderIdeas(ideas, "i-2", "promising", "i-3")]).toEqual([
      ["i-2", 1],
      ["i-3", 2],
    ])
    expect(topIdeaOrder(ideas, "inbox")).toBe(0)
    expect(topIdeaOrder(ideas, "converted")).toBe(0)
    expect(topIdeaOrder([], "promising")).toBe(0)
    expect(newIdeaId(21)).toBe("i-21")
  })

  it("移动和更新纯函数返回新对象，禁止已转换灵感移动", () => {
    const original = ideas[0]!
    const moved = moveIdea(original, "promising", { at, order: -1 })
    expect(moved).toMatchObject({ ok: true, idea: { status: "promising", order: -1, updatedAt: at } })
    expect(original.status).toBe("inbox")
    expect(moveIdea(ideas[4]!, "inbox", { at, order: 0 })).toEqual({ ok: false, code: "STATE_CONFLICT", reason: "已经转成作品了" })

    expect(updateIdea(original, { text: "  新灵感  ", detail: "新细节", accountId: null }, { at })).toMatchObject({
      ok: true,
      idea: { text: "新灵感", detail: "新细节", updatedAt: at },
    })
    const cleared = updateIdea(original, { accountId: null }, { at })
    expect(cleared.ok && "accountId" in cleared.idea).toBe(false)
    expect(updateIdea(original, { text: "  " }, { at })).toEqual({ ok: false, code: "INVALID", reason: "灵感内容不能为空" })
  })

  it("undefined patch 字段视为未修改，不覆盖灵感原值", () => {
    const original = idea("i-undefined", "inbox", 2)
    const result = updateIdea(original, { text: undefined, detail: undefined, accountId: undefined }, { at: "2026-10-08T09:45:00+08:00" })
    expect(result).toMatchObject({
      ok: true,
      idea: {
        text: original.text,
        detail: original.detail,
        accountId: original.accountId,
        updatedAt: "2026-10-08T09:45:00+08:00",
      },
    })
  })

  it("转作品记账置顶并对 workIds 去重", () => {
    const base = { ...ideas[0]!, workIds: ["z-1", "b-2"] }
    const converted = markConverted(base, ["b-2", "z-3", "z-1"], { at, order: -3 })
    expect(converted).toMatchObject({ status: "converted", order: -3, updatedAt: at, workIds: ["z-1", "b-2", "z-3"] })
    expect(base.status).toBe("inbox")
    expect(base.workIds).toEqual(["z-1", "b-2"])
  })
})
