import { describe, expect, it } from "vitest"
import { daysBetween } from "../dates/index.ts"
import type { DailyPoint, MetricsDataset, WeeklyNote } from "../types/index.ts"
import { makeAccount, makeWork } from "../metrics/test-fixtures.ts"
import { reportWeeks, weekReport } from "./report.ts"

const zhihu = makeAccount("a", "zhihu", { name: "小叶" })
const blog = makeAccount("b", "blog", { name: "技术博客" })
const noData = makeAccount("c", "bilibili", { name: "视频号" })

function pointsFor(accountId: string): DailyPoint[] {
  return daysBetween("2026-09-20", "2026-10-07").map((day) => {
    if (accountId === "a") {
      return {
        day,
        followers: day < "2026-09-28" ? 1000 : day < "2026-10-05" ? 1020 : 1024,
        reads: day < "2026-09-28" ? 5 : day < "2026-10-05" ? 10 : 3,
        interactions: 2,
        posts: 0,
      }
    }
    return {
      day,
      followers: day < "2026-09-28" ? 100 : day < "2026-10-05" ? 105 : 107,
      reads: day < "2026-09-28" ? 2 : day < "2026-10-05" ? 5 : 1,
      interactions: 1,
      posts: 0,
    }
  })
}

const dataset: MetricsDataset = {
  today: "2026-10-08",
  latestDay: "2026-10-07",
  daily: { a: pointsFor("a"), b: pointsFor("b") },
  workDays: {
    "z-best": [
      { day: "2026-09-30", reads: 20, interactions: 4 },
      { day: "2026-10-01", reads: 30, interactions: 6 },
    ],
    "z-second": [{ day: "2026-10-01", reads: 30, interactions: 3 }],
  },
}
const works = [
  makeWork("z-best", "a", "2026-09-01", { title: "旧作：摘要", totals: { views: 100 } }),
  makeWork("z-second", "a", "2026-09-01", { title: "次佳作品", totals: { views: 200 } }),
  makeWork("c-new", "c", "2026-10-01"),
  makeWork("z-new", "a", "2026-10-02"),
  makeWork("b-new", "b", "2026-10-03"),
]
const note: WeeklyNote = {
  week: "2026-09-28",
  wins: "发布新作",
  improve: "",
  next: "",
  updatedAt: "2026-10-05T09:00:00+08:00",
}
const input = { dataset, accounts: [zhihu, blog, noData], works, notes: [note] }

describe("周报", () => {
  it("完整周计算账号和合计，发布无数据作品，小结每句保持客观", () => {
    const report = weekReport(
      { ...input, accounts: [...input.accounts, makeAccount("future", "blog", { since: "2026-10-05" })] },
      "2026-09-28",
    )
    expect(report.complete).toBe(true)
    expect(report.end).toBe("2026-10-04")
    expect(report.totals).toEqual({ delta: 25, posts: 3, reads: 105, interactions: 21 })
    expect(report.readsChange).toBeCloseTo(1.142857, 6)
    expect(report.digest).toEqual([
      "这周发了 3 篇：知乎 1 篇、博客 1 篇、B站 1 篇。",
      "粉丝合计 +25，其中小叶（知乎）+20。",
      "浏览 105，比上周 +114%；《旧作》最多（50）。",
    ])
    expect(report.rows.map((row) => [row.account.id, row.hasData, row.delta, row.posts])).toEqual([
      ["a", true, 20, 1],
      ["b", true, 5, 1],
      ["c", false, 0, 1],
    ])
    expect(report.published.map((item) => item.work.id)).toEqual(["c-new", "z-new", "b-new"])
    expect(report.rows[0]?.best?.weekReads).toBe(50)
    expect(report.note).toEqual(note)
  })

  it("本周截至昨天，空周不虚报发布；过去无发布周保留无发布句", () => {
    const current = weekReport(input, "2026-10-05")
    expect(current.complete).toBe(false)
    expect(current.end).toBe("2026-10-07")
    expect(current.totals).toEqual({ delta: 6, posts: 0, reads: 12, interactions: 9 })
    expect(current.readsChange).toBeCloseTo((12 - 45) / 45, 10)
    expect(current.digest[0]).toBe("本周到周三还没有发布。")
    expect(current.note).toBeNull()

    const empty = weekReport(input, "2026-09-14")
    expect(empty.complete).toBe(true)
    expect(empty.digest[0]).toBe("这周还没有发布。")
    expect(empty.published).toEqual([])
  })

  it("断更小结使用平台 audienceLabel", () => {
    const oldBlog = makeAccount("old", "blog", { name: "老博客" })
    const oldInput = {
      dataset: { ...dataset, daily: { old: pointsFor("b") } },
      accounts: [oldBlog],
      works: [makeWork("old-work", "old", "2026-09-01")],
      notes: [],
    }
    expect(weekReport(oldInput, "2026-09-28").digest).toContain("老博客 已经 33 天没更新，订阅 +5。")
  })

  it("周一从昨天的数据周开始，并将上一周识别为完整周", () => {
    const mondayInput = {
      dataset: { ...dataset, today: "2026-10-12" as const, latestDay: "2026-10-11" as const },
      accounts: [zhihu],
      works: [makeWork("sunday-publication", "a", "2026-10-11")],
      notes: [],
    }
    const weeks = reportWeeks("2026-10-12")
    expect(weeks[0]).toBe("2026-10-05")
    const report = weekReport(mondayInput, "2026-10-05")
    expect(report).toMatchObject({ week: "2026-10-05", end: "2026-10-11", complete: true, totals: { posts: 1 } })
    expect(report.digest[0]).toBe("这周发了 1 篇：知乎 1 篇。")
  })

  it("周列表按本周一开始倒序，默认九周", () => {
    expect(reportWeeks("2026-10-08")).toEqual([
      "2026-10-05",
      "2026-09-28",
      "2026-09-21",
      "2026-09-14",
      "2026-09-07",
      "2026-08-31",
      "2026-08-24",
      "2026-08-17",
      "2026-08-10",
    ])
    expect(reportWeeks("2026-10-08", 2)).toEqual(["2026-10-05", "2026-09-28"])
    expect(reportWeeks("2026-10-08", 0)).toEqual([])
  })
})
