import { describe, expect, it } from "vitest"

import { THIS_WEEK } from "@/data/clock"
import { PUBLICATIONS } from "@/data/works"
import { INBOX, REPORT_WEEKS, columnRows, metricSeries, metricText, summaryOf, topPublications, weekCadence, weekReport } from "./metrics"

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
    expect(zhihu.works).toBe(13)
    expect(zhihu.lastPublishedAt).toBe("2026-10-02")
    expect(zhihu.daysSincePublish).toBe(6)
    expect(zhihu.postsThisWeek).toBe(0)
    expect(zhihu.stale).toBe(false)
    expect(zhihu.weeklyGain).toHaveLength(12)
  })

  it("公众号 72 天没更新，算断更", () => {
    const wechat = summaryOf("wechat-acg")
    expect(wechat.followers).toBe(3257)
    expect(wechat.followers30d).toBe(-43)
    expect(wechat.daysSincePublish).toBe(72)
    expect(wechat.stale).toBe(true)
  })

  it("博客", () => {
    const blog = summaryOf("blog-chaosyn")
    expect(blog.followers).toBe(314)
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
    expect(weekly.value).toBe(9129)
    expect(weekly.points).toHaveLength(12)
    expect(weekly.points.at(-1)?.value).toBe(9129)
    expect(weekly.change).toBeCloseTo(0.1632, 4)
    const daily = metricSeries("all", "followers", "4w")
    expect(daily.points).toHaveLength(28)
    expect(daily.points.at(-1)?.label).toBe("10/7")
  })

  it("阅读取合计，比上一期", () => {
    const reads = metricSeries("all", "reads", "4w")
    expect(reads.value).toBe(68563)
    expect(reads.change).toBeCloseTo(2.2197, 4)
    expect(metricSeries("zhihu-yiye", "reads", "12w").value).toBe(77139)
  })
})

describe("周报", () => {
  it("上周（9 月 28 日 – 10 月 4 日）", () => {
    const report = weekReport("2026-09-28")
    expect(report.complete).toBe(true)
    expect(report.end).toBe("2026-10-04")
    expect(report.totals).toEqual({ delta: 144, posts: 3, target: 11, reads: 13684, interactions: 1086 })
    expect(report.readsChange).toBeCloseTo(-0.266, 3)
    expect(report.digest[0]).toBe("这周发了 3 篇，目标 11 篇：知乎 2 篇、博客 1 篇。")
    expect(report.digest[1]).toBe("粉丝合计 +144，其中一叶之桐（知乎）+128。")
    expect(report.digest[2]).toBe("阅读 1.4万，比上周 −27%；《AI 做的页面像模板货又空心》最多（2,985）。")
    expect(report.published.map((item) => item.pub.id)).toEqual(["p-blog-design-extraction-saas-dashboard", "zh-r2-oci", "zh-edge-answer"])
    expect(report.rows.find((row) => row.account.id === "zhihu-yiye")?.delta).toBe(128)
    expect(report.note?.week).toBe("2026-09-28")
  })

  it("本周还没过完，统计到昨天", () => {
    const report = weekReport(THIS_WEEK)
    expect(report.complete).toBe(false)
    expect(report.end).toBe("2026-10-07")
    expect(report.totals.posts).toBe(0)
    expect(report.digest[0]).toBe("本周到周三还没有发布，目标 11 篇。")
  })

  it("能看本周和之前 8 周", () => {
    expect(REPORT_WEEKS).toHaveLength(9)
    expect(REPORT_WEEKS[0]).toBe(THIS_WEEK)
    expect(REPORT_WEEKS[8]).toBe("2026-08-10")
  })
})

describe("排行、栏目、本周节奏、待处理", () => {
  it("按阅读和按近 7 天增长排", () => {
    expect(topPublications("reads", 3).map((item) => item.pub.id)).toEqual(["zh-prompt-subagent", "zh-claude-md", "zh-chatgpt-mcp"])
    const growth = topPublications("growth", 2)
    expect(growth.map((item) => [item.pub.id, item.growth])).toEqual([
      ["zh-r2-oci", 2416],
      ["zh-edge-answer", 1960],
    ])
  })

  it("知乎栏目：AI 工程化最好，经济管理和认知科学没发过", () => {
    const rows = columnRows("zhihu-yiye")
    expect(rows.find((row) => row.column.id === "ai-eng")).toMatchObject({ pubs: 5, avgReads: 10894 })
    expect(rows.find((row) => row.column.id === "econ")).toMatchObject({ pubs: 0, avgReads: null })
  })

  it("本周节奏：周二等回填，周五两篇排期，周六一组卡片", () => {
    const days = weekCadence()
    expect(days.map((day) => day.items.length)).toEqual([0, 1, 0, 0, 2, 1, 0])
    expect(days[1].items[0].kind).toBe("pending")
    expect(days[3].isToday).toBe(true)
  })

  it("待处理 12 件：风险在前，排期按日子从近到远", () => {
    expect(INBOX).toHaveLength(12)
    expect(INBOX.map((item) => item.kind)).toEqual([
      "failed",
      "data",
      "stale",
      "run",
      "run",
      "run",
      "run",
      "planned",
      "planned",
      "planned",
      "manual",
      "manual",
    ])
    expect(INBOX[2].title).toBe("ACG萌图宅 72 天没更新")
    expect(INBOX.filter((item) => item.kind === "planned").at(-1)?.title).toBe("2 天后发：AI 做的页面像模板货又空心")
  })

  it("平台没有的数据显示「—」", () => {
    const blogPub = PUBLICATIONS.find((pub) => pub.id === "p-blog-chatgpt-mcp-3a94342e")
    const zhihuPub = PUBLICATIONS.find((pub) => pub.id === "zh-chatgpt-mcp")
    expect(blogPub && metricText(blogPub, "likes")).toBe("—")
    expect(zhihuPub && metricText(zhihuPub, "likes")).toBe("702")
    expect(zhihuPub && metricText(zhihuPub, "reads")).toBe("1.6万")
  })
})
