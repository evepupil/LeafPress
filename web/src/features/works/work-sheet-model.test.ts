import { describe, expect, it } from "vitest"

import { IDEAS } from "@/data/ideas"
import type { Work, WorkLog } from "@/data/types"
import { WORKS, workById } from "@/data/works"
import { contextSourceOf, newestFirst, runLook, timeText, workflowLocked } from "./work-sheet-model"

describe("「让 AI 做」按钮", () => {
  const todo = workById("b-tunnel-access")

  it("待实现：没反馈写「让 AI 做」，反馈过写「让 AI 继续」", () => {
    expect(runLook(todo, false)).toEqual({ label: "让 AI 做", busy: false })
    expect(runLook({ ...todo, feedback: "发布了" }, false)).toEqual({ label: "让 AI 继续", busy: false })
  })

  it("进行中：页面在跑就禁用写「AI 在做」，没在跑（外面的 agent 在做）写「接着做」", () => {
    const doing = workById("z-reasoning")
    expect(runLook(doing, true)).toEqual({ label: "AI 在做", busy: true })
    expect(runLook(doing, false)).toEqual({ label: "接着做", busy: false })
  })

  it("等你处理、已完成：没有这个按钮", () => {
    expect(runLook(workById("z-design-extraction"), false)).toBeNull()
    expect(runLook(workById("z-chatgpt-mcp"), false)).toBeNull()
  })
})

describe("换工作流", () => {
  const todo = workById("z-jev")

  it("只有还没开始做的待实现作品能换", () => {
    expect(workflowLocked(todo)).toBe(false)
    expect(workflowLocked({ ...todo, step: 5, feedback: "可以" })).toBe(true)
    expect(workflowLocked(workById("z-reasoning"))).toBe(true)
    expect(workflowLocked(workById("z-design-extraction"))).toBe(true)
    expect(workflowLocked(workById("z-chatgpt-mcp"))).toBe(true)
  })
})

describe("复制给 AI 时附的来源", () => {
  it("来源是作品：写那个作品的标题、链接和本机原稿", () => {
    const blog = workById("chatgpt-mcp-3a94342e")
    expect(contextSourceOf(workById("z-chatgpt-mcp"), WORKS, IDEAS)).toEqual({
      title: blog.title,
      url: blog.url,
      localPath: blog.localPath,
    })
  })

  it("来源是灵感：只写灵感那句话", () => {
    const idea = IDEAS.find((item) => item.id === "i-02")
    expect(idea).toBeDefined()
    expect(contextSourceOf(workById("z-fleet-truncation"), WORKS, IDEAS)).toEqual({ title: idea?.text })
  })

  it("导入的博客文章：写它自己", () => {
    const blog = workById("chatgpt-mcp-3a94342e")
    expect(contextSourceOf(blog, WORKS, IDEAS)).toEqual({ title: blog.title, url: blog.url, localPath: blog.localPath })
  })

  it("直接新建的、或来源已经被删掉的：不写", () => {
    expect(contextSourceOf(workById("z-claude-md"), WORKS, IDEAS)).toBeUndefined()
    expect(contextSourceOf(workById("z-jev"), [], IDEAS)).toBeUndefined()
    expect(contextSourceOf(workById("z-fleet-truncation"), WORKS, [])).toBeUndefined()
  })
})

describe("记录排序", () => {
  const log: WorkLog[] = [
    { at: "2026-10-06T21:10:00+08:00", text: "创建" },
    { at: "2026-10-06T21:24:00+08:00", text: "完成：AI 改写" },
    { at: "2026-10-06T21:24:00+08:00", text: "等你：你去知乎投递" },
    { at: "2026-10-06T21:05:00+08:00", text: "更早的一条" },
  ]

  it("按时间倒序，同一时刻后写的在前，index 指回原位置", () => {
    const rows = newestFirst(log)
    expect(rows.map((row) => row.entry.text)).toEqual(["等你：你去知乎投递", "完成：AI 改写", "创建", "更早的一条"])
    expect(rows.map((row) => row.index)).toEqual([2, 1, 0, 3])
  })

  it("不改原来的记录", () => {
    const before = log.map((entry) => entry.text)
    newestFirst(log)
    expect(log.map((entry) => entry.text)).toEqual(before)
  })
})

describe("属性里的时间", () => {
  it("已完成的作品带发布日，其余只写创建", () => {
    const done = workById("z-chatgpt-mcp")
    expect(timeText(done)).toMatch(/^创建 .+ · 发布 7月29日$/)
    const todo: Work = workById("z-jev")
    expect(timeText(todo)).toMatch(/^创建 /)
    expect(timeText(todo)).not.toContain("发布")
  })
})
