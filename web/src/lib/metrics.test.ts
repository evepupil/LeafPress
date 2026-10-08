import { describe, expect, it } from "vitest"

import { workById } from "@/data/works"
import { columnRows, metricSeries, metricText, summaryOf, topWorks } from "./metrics"

/**
 * 这里的数字是生成器算出来的固定结果（种子固定），页面规格的交互检查表照这些数字写。
 * 改了演示数据，这些期望值要跟着更新，页面规格里对应的数字也要一起改。
 */

describe("账号概况", () => {
  it("知乎", () => {
    const zhihu = summaryOf("zhihu-yiye")
    expect(zhihu.followers).toBe(5510)
    expect(zhihu.followers7d).toBe(109)
    expect(zhihu.followers30d).toBe(704)
    expect(zhihu.reads7d).toBe(7478)
    expect(zhihu.works).toBe(14)
    expect(zhihu.lastPublishedAt).toBe("2026-10-02")
    expect(zhihu.daysSincePublish).toBe(6)
    expect(zhihu.postsThisWeek).toBe(0)
    expect(zhihu.stale).toBe(false)
    expect(zhihu.weeklyGain).toHaveLength(12)
  })

  it("博客", () => {
    const blog = summaryOf("blog-chaosyn")
    expect(blog.followers).toBe(314)
    expect(blog.followers7d).toBe(10)
    expect(blog.reads7d).toBe(3144)
    expect(blog.works).toBe(39)
    expect(blog.lastPublishedAt).toBe("2026-09-29")
  })

  it("筹备中的号还没发过", () => {
    expect(summaryOf("bili-yiye").followers).toBe(41)
    expect(summaryOf("bili-yiye").lastPublishedAt).toBeNull()
    expect(summaryOf("xhs-yiye").followers).toBe(7)
  })
})

describe("走势", () => {
  it("全部账号的粉丝：近 12 周按周、近 4 周按天", () => {
    const weekly = metricSeries("all", "followers", "12w")
    expect(weekly.value).toBe(5872)
    expect(weekly.points).toHaveLength(12)
    expect(weekly.points.at(-1)?.value).toBe(5872)
    expect(weekly.change).toBeCloseTo(0.2994, 4)
    const daily = metricSeries("all", "followers", "4w")
    expect(daily.points).toHaveLength(28)
    expect(daily.points.at(-1)?.label).toBe("10/7")
  })

  it("阅读、互动、发布取合计，比上一期", () => {
    const reads = metricSeries("all", "reads", "4w")
    expect(reads.value).toBe(68163)
    expect(reads.change).toBeCloseTo(2.3372, 4)
    expect(metricSeries("all", "reads", "12w").value).toBe(115204)
    expect(metricSeries("all", "interactions", "12w").value).toBe(10374)
    expect(metricSeries("all", "posts", "12w").value).toBe(30)
    expect(metricSeries("zhihu-yiye", "reads", "12w").value).toBe(77139)
  })
})

describe("排行、栏目", () => {
  it("按阅读和按近 7 天增长排", () => {
    expect(topWorks("reads", 3).map((item) => item.work.id)).toEqual(["z-prompt-subagent", "z-claude-md", "z-chatgpt-mcp"])
    expect(topWorks("growth", 2).map((item) => [item.work.id, item.growth])).toEqual([
      ["z-r2-oci", 2416],
      ["z-edge-answer", 1960],
    ])
    expect(topWorks("reads", 50, "blog-chaosyn")).toHaveLength(39)
  })

  it("知乎栏目：AI 工程化最好，经济管理和认知科学没发过", () => {
    const rows = columnRows("zhihu-yiye")
    expect(rows.find((row) => row.column.id === "ai-eng")).toMatchObject({ works: 5, avgReads: 10894, share: 0.5 })
    expect(rows.find((row) => row.column.id === "econ")).toMatchObject({ works: 0, avgReads: null })
  })

  it("平台没有的数据显示「—」，没发的作品都是「—」", () => {
    expect(metricText(workById("chatgpt-mcp-3a94342e"), "likes")).toBe("—")
    expect(metricText(workById("z-chatgpt-mcp"), "likes")).toBe("702")
    expect(metricText(workById("z-chatgpt-mcp"), "reads")).toBe("1.6万")
    expect(metricText(workById("z-jev"), "reads")).toBe("—")
  })
})
