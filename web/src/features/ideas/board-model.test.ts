import { describe, expect, it } from "vitest"

import type { Idea } from "@leafpress/core"
import { moveIdeaPreview } from "./board-model"

function idea(id: string, status: Idea["status"], order: number): Idea {
  return {
    id,
    text: id,
    detail: "",
    status,
    source: "quick",
    order,
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-01T09:00:00Z",
    workIds: [],
  }
}

describe("灵感拖动预览", () => {
  it("updates status and order immediately using the shared rule", () => {
    const ideas = [idea("a", "inbox", 1), idea("b", "inbox", 2), idea("c", "promising", 1)]
    const next = moveIdeaPreview(ideas, "b", "promising", "c", "2026-10-02T10:00:00Z")
    expect(next.find((item) => item.id === "b")).toMatchObject({ status: "promising", order: 1, updatedAt: "2026-10-02T10:00:00Z" })
    expect(next.find((item) => item.id === "c")?.order).toBe(2)
    expect(ideas.find((item) => item.id === "b")?.status).toBe("inbox")
  })

  it("does not move converted or missing ideas", () => {
    const ideas = [idea("converted", "converted", 1)]
    expect(moveIdeaPreview(ideas, "converted", "inbox", null, "2026-10-02T10:00:00Z")).toBe(ideas)
    expect(moveIdeaPreview(ideas, "missing", "inbox", null, "2026-10-02T10:00:00Z")).toBe(ideas)
  })
})
