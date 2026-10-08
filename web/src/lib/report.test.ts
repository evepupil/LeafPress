import { describe, expect, it } from "vitest"

import { THIS_WEEK } from "@/data/clock"
import { REPORT_WEEKS, weekReport } from "./report"

describe("周报", () => {
  it("上周（9 月 28 日 – 10 月 4 日）", () => {
    const report = weekReport("2026-09-28")
    expect(report.complete).toBe(true)
    expect(report.end).toBe("2026-10-04")
    expect(report.totals).toEqual({ delta: 153, posts: 3, target: 4, reads: 13607, interactions: 1086 })
    expect(report.readsChange).toBeCloseTo(-0.2663, 4)
    expect(report.digest).toEqual([
      "这周发了 3 篇，目标 4 篇：知乎 2 篇、博客 1 篇。",
      "粉丝合计 +153，其中一叶之桐（知乎）+128。",
      "阅读 1.4万，比上周 −27%；《AI 做的页面像模板货又空心》最多（2,985）。",
    ])
    expect(report.suggestions).toEqual([
      "技术博客（博客）发了 1 篇，比目标少 1 篇。",
      "「AI 工程化」近 12 周平均每篇阅读 1.1万，是表现最好的栏目。",
      "「经济管理」「认知科学与心理学」近 12 周还没发过，离计划占比差得最多。",
    ])
    expect(report.published.map((item) => item.work.id)).toEqual(["design-extraction-saas-dashboard", "z-r2-oci", "z-edge-answer"])
    expect(report.rows.map((row) => [row.account.id, row.delta, row.posts])).toEqual([
      ["zhihu-yiye", 128, 2],
      ["blog-chaosyn", 14, 1],
      ["bili-yiye", 8, 0],
      ["xhs-yiye", 3, 0],
    ])
    expect(report.note?.week).toBe("2026-09-28")
  })

  it("本周还没过完，统计到昨天", () => {
    const report = weekReport(THIS_WEEK)
    expect(report.complete).toBe(false)
    expect(report.end).toBe("2026-10-07")
    expect(report.totals).toEqual({ delta: 45, posts: 0, target: 4, reads: 3251, interactions: 254 })
    expect(report.digest[0]).toBe("本周到周三还没有发布，目标 4 篇。")
    expect(report.note).toBeNull()
  })

  it("能看本周和之前 8 周", () => {
    expect(REPORT_WEEKS).toHaveLength(9)
    expect(REPORT_WEEKS[0]).toBe(THIS_WEEK)
    expect(REPORT_WEEKS[8]).toBe("2026-08-10")
  })
})
