import { describe, expect, it } from "vitest"

import { workById } from "@/data/works"
import { metricSeries, metricText, summaryOf, topWorks } from "./metrics"

/**
 * 这里的数字是生成器算出来的固定结果（种子固定），页面规格的交互检查表照这些数字写。
 * 改了演示数据，这些期望值要跟着更新，页面规格里对应的数字也要一起改。
 */

describe("账号概况", () => {
  it("知乎", () => {
    const zhihu = summaryOf("zhihu-yiye")
    expect(zhihu.hasData).toBe(true)
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

  it("拿数据的工具还没做的号没有数据", () => {
    for (const id of ["bili-yiye", "xhs-yiye"]) {
      const summary = summaryOf(id)
      expect(summary.hasData).toBe(false)
      expect(summary.followers).toBe(0)
      expect(summary.lastPublishedAt).toBeNull()
    }
  })
})

describe("走势", () => {
  it("全部账号的粉丝：近 12 周按周、近 4 周按天", () => {
    const weekly = metricSeries("all", "followers", "12w")
    expect(weekly.value).toBe(5824)
    expect(weekly.points).toHaveLength(12)
    expect(weekly.points.at(-1)?.value).toBe(5824)
    expect(weekly.change).toBeCloseTo(0.2888, 4)
    const daily = metricSeries("all", "followers", "4w")
    expect(daily.points).toHaveLength(28)
    expect(daily.points.at(-1)?.label).toBe("10/7")
  })

  it("浏览、互动、发布取合计，比上一期", () => {
    const reads = metricSeries("all", "reads", "4w")
    expect(reads.value).toBe(68163)
    expect(reads.change).toBeCloseTo(2.3372, 4)
    expect(metricSeries("all", "reads", "12w").value).toBe(115204)
    expect(metricSeries("all", "interactions", "12w").value).toBe(10664)
    expect(metricSeries("all", "posts", "12w").value).toBe(30)
    expect(metricSeries("zhihu-yiye", "reads", "12w").value).toBe(77139)
    expect(metricSeries("zhihu-yiye", "interactions", "12w").value).toBe(10547)
  })
})

describe("排行和数据项", () => {
  it("按主数据、互动、近 7 天增长排", () => {
    expect(topWorks("reach", 3).map((item) => [item.work.id, item.reach])).toEqual([
      ["z-prompt-subagent", 21904],
      ["z-claude-md", 18330],
      ["z-chatgpt-mcp", 15620],
    ])
    expect(topWorks("interactions", 1).map((item) => [item.work.id, item.interactions])).toEqual([["z-prompt-subagent", 3635]])
    expect(topWorks("growth", 2).map((item) => [item.work.id, item.growth])).toEqual([
      ["z-r2-oci", 2416],
      ["z-edge-answer", 1960],
    ])
    expect(topWorks("reach", 50, "blog-chaosyn")).toHaveLength(39)
  })

  it("各平台按自己的数据项显示；平台没有的、没发的显示「—」", () => {
    const zhihu = workById("z-chatgpt-mcp")
    expect(["views", "likes", "collects", "comments", "shares"].map((key) => metricText(zhihu, key))).toEqual([
      "1.6万",
      "702",
      "1,380",
      "88",
      "57",
    ])
    const blog = workById("chatgpt-mcp-3a94342e")
    expect(["pageviews", "visitors", "comments"].map((key) => metricText(blog, key))).toEqual(["4,601", "3,209", "12"])
    expect(metricText(blog, "likes")).toBe("—")
    expect(metricText(workById("z-jev"), "views")).toBe("—")
  })
})
