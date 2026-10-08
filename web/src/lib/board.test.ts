import { describe, expect, it } from "vitest"

import { IDEAS } from "@/data/ideas"
import type { Work } from "@/data/types"
import { WORKS, workById } from "@/data/works"
import {
  EMPTY_FILTER,
  countBy,
  derivedFrom,
  filterWorks,
  newWorkId,
  notices,
  reorderIdeas,
  reorderTodo,
  sortColumn,
  sortIdeas,
  workflowUsage,
} from "./board"

describe("作品看板", () => {
  it("64 个作品：待实现 6、进行中 1、等你处理 4、已完成 53", () => {
    expect(WORKS).toHaveLength(64)
    expect([countBy(WORKS, "todo"), countBy(WORKS, "doing"), countBy(WORKS, "waiting"), countBy(WORKS, "done")]).toEqual([6, 1, 4, 53])
  })

  it("待实现按排队顺序，等你处理按最近变动，已完成按发布日期", () => {
    expect(sortColumn(WORKS, "todo").map((work) => work.id)).toEqual([
      "b-tunnel-access",
      "z-fleet-truncation",
      "z-jev",
      "z-hourly-rate",
      "z-vacuum-into",
      "z-tunnel-access",
    ])
    expect(sortColumn(WORKS, "waiting").map((work) => work.id)).toEqual([
      "z-leafpress-intro",
      "v-tunnel-ssh",
      "x-ai-frontend",
      "z-design-extraction",
    ])
    expect(
      sortColumn(WORKS, "done")
        .slice(0, 3)
        .map((work) => work.id),
    ).toEqual(["z-edge-answer", "z-r2-oci", "design-extraction-saas-dashboard"])
  })

  it("拖动重排待实现：挪到某张卡前面，或者放到最后", () => {
    const toFront = reorderTodo(WORKS, "z-vacuum-into", "b-tunnel-access")
    expect(toFront.get("z-vacuum-into")).toBe(1)
    expect(toFront.get("b-tunnel-access")).toBe(2)
    expect(toFront.get("z-tunnel-access")).toBe(6)
    const toEnd = reorderTodo(WORKS, "b-tunnel-access", null)
    expect(toEnd.get("b-tunnel-access")).toBe(6)
    expect(toEnd.get("z-fleet-truncation")).toBe(1)
  })

  it("按平台和关键字筛", () => {
    expect(filterWorks(WORKS, { platform: "zhihu", query: "" })).toHaveLength(22)
    expect(filterWorks(WORKS, { platform: "blog", query: "" })).toHaveLength(40)
    expect(filterWorks(WORKS, { platform: "all", query: "tunnel" }).map((work) => work.id)).toEqual([
      "modelscope-gpu-reverse-ssh-tunnel",
      "cloudflare-tunnel-ssh-3bd4342e",
      "cloudflare-tunnel-2f54342e",
      "z-tunnel-ssh",
      "v-tunnel-ssh",
      "b-tunnel-access",
      "z-tunnel-access",
    ])
    expect(filterWorks(WORKS, EMPTY_FILTER)).toHaveLength(64)
  })

  it("工作流用量、转出去的作品、新编号", () => {
    expect(workflowUsage(WORKS, "blog-to-zhihu")).toEqual({ active: 3, done: 10 })
    expect(workflowUsage(WORKS, "zhihu-write")).toEqual({ active: 5, done: 2 })
    expect(derivedFrom(WORKS, "ai-frontend-info-design-first").map((work) => work.id)).toEqual(["z-ai-frontend", "x-ai-frontend"])
    expect(newWorkId("zhihu", 101)).toBe("z-101")
    expect(newWorkId("bilibili", 102)).toBe("v-102")
  })
})

describe("灵感看板", () => {
  it("收件箱 7、值得写 5、已转作品 5，按先后排", () => {
    expect(sortIdeas(IDEAS, "inbox").map((idea) => idea.id)).toEqual(["i-18", "i-19", "i-20", "i-12", "i-08", "i-09", "i-15"])
    expect(sortIdeas(IDEAS, "promising")).toHaveLength(5)
    expect(sortIdeas(IDEAS, "converted").map((idea) => idea.id)).toEqual(["i-03", "i-17", "i-02", "i-04", "i-05"])
  })

  it("拖到另一列的某张卡前面", () => {
    const moved = IDEAS.map((idea) => (idea.id === "i-15" ? { ...idea, status: "promising" as const } : idea))
    const orders = reorderIdeas(moved, "i-15", "promising", "i-06")
    expect(orders.get("i-01")).toBe(1)
    expect(orders.get("i-15")).toBe(2)
    expect(orders.get("i-06")).toBe(3)
    expect(orders.size).toBe(6)
  })
})

describe("提醒", () => {
  it("数据拉取失败在前，然后是等你处理的作品（新的在前）；还没接数据的号不提醒", () => {
    const items = notices(WORKS)
    expect(items.map((item) => item.kind)).toEqual(["data", "waiting", "waiting", "waiting", "waiting"])
    expect(items[0].title).toBe("技术博客数据拉取失败")
    expect(items[1].href).toBe("/?open=z-leafpress-intro")
  })

  it("页面上重新拉成功了，拉取失败的提醒就没了", () => {
    const pulls = { "blog-chaosyn": { status: "ok" as const, at: "2026-10-08T09:31:00+08:00" } }
    expect(notices(WORKS, pulls).some((item) => item.kind === "data")).toBe(false)
  })

  it("等你处理的作品跟着页面上的作品变", () => {
    const handled: Work[] = WORKS.map((work) =>
      work.id === "z-design-extraction" ? { ...workById("z-design-extraction"), status: "todo" } : work,
    )
    expect(notices(handled).filter((item) => item.kind === "waiting")).toHaveLength(3)
  })
})
