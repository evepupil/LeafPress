import { describe, expect, it } from "vitest"

import { THIS_WEEK } from "@/data/clock"
import { REPORT_WEEKS, weekReport } from "./report"

describe("周报", () => {
  it("上周（9 月 28 日 – 10 月 4 日）：只有客观的小结，没有目标和建议", () => {
    const report = weekReport("2026-09-28")
    expect(report.complete).toBe(true)
    expect(report.end).toBe("2026-10-04")
    expect(report.totals).toEqual({ delta: 142, posts: 3, reads: 13607, interactions: 1123 })
    expect(report.readsChange).toBeCloseTo(-0.2663, 4)
    expect(report.digest).toEqual([
      "这周发了 3 篇：知乎 2 篇、博客 1 篇。",
      "粉丝合计 +142，其中一叶之桐（知乎）+128。",
      "浏览 1.4万，比上周 −27%；《AI 做的页面像模板货又空心》最多（2,985）。",
    ])
    expect(report.published.map((item) => item.work.id)).toEqual(["design-extraction-saas-dashboard", "z-r2-oci", "z-edge-answer"])
    expect(report.rows.map((row) => [row.account.id, row.hasData, row.delta, row.posts])).toEqual([
      ["zhihu-yiye", true, 128, 2],
      ["blog-chaosyn", true, 14, 1],
      ["bili-yiye", false, 0, 0],
      ["xhs-yiye", false, 0, 0],
    ])
    expect(report.note?.week).toBe("2026-09-28")
  })

  it("9 月 21 日那周", () => {
    expect(weekReport("2026-09-21").digest[0]).toBe("这周发了 6 篇：知乎 1 篇、博客 5 篇。")
  })

  it("本周还没过完，统计到昨天", () => {
    const report = weekReport(THIS_WEEK)
    expect(report.complete).toBe(false)
    expect(report.end).toBe("2026-10-07")
    expect(report.totals).toEqual({ delta: 41, posts: 0, reads: 3251, interactions: 260 })
    expect(report.digest[0]).toBe("本周到周三还没有发布。")
    expect(report.note).toBeNull()
  })

  it("能看本周和之前 8 周", () => {
    expect(REPORT_WEEKS).toHaveLength(9)
    expect(REPORT_WEEKS[0]).toBe(THIS_WEEK)
    expect(REPORT_WEEKS[8]).toBe("2026-08-10")
  })
})
