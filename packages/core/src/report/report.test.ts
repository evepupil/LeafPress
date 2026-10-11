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
  lastDays: { a: "2026-10-07", b: "2026-10-07" },
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
    // 合计的第二个数只算知乎的互动（每天 2 × 7 天）；博客的访客（每天 1）不能和互动相加
    expect(report.totals).toEqual({ delta: 25, posts: 3, reads: 105, interactions: 14 })
    expect(report.readsChange).toBeCloseTo(1.142857, 6)
    expect(report.digest).toEqual([
      "这周发了 3 篇：知乎 1 篇、博客 1 篇、B站 1 篇。",
      "粉丝合计 +25，其中小叶（知乎）+20。",
      "浏览 105，比上周 +114%；《旧作》最多（50）。",
    ])
    expect(report.rows.map((row) => [row.account.id, row.hasData, row.followersKnown, row.delta, row.posts])).toEqual([
      ["a", true, true, 20, 1],
      ["b", true, true, 5, 1],
      ["c", false, false, 0, 1],
    ])
    expect(report.followersKnown).toBe(true)
    expect(report.published.map((item) => item.work.id)).toEqual(["c-new", "z-new", "b-new"])
    expect(report.rows[0]?.best?.weekReads).toBe(50)
    expect(report.note).toEqual(note)
  })

  it("本周截至昨天，空周不虚报发布；过去无发布周保留无发布句", () => {
    const current = weekReport(input, "2026-10-05")
    expect(current.complete).toBe(false)
    expect(current.end).toBe("2026-10-07")
    // 只算知乎：每天 2 × 3 天
    expect(current.totals).toEqual({ delta: 6, posts: 0, reads: 12, interactions: 6 })
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
      dataset: { ...dataset, daily: { old: pointsFor("b") }, lastDays: { old: "2026-10-07" } },
      accounts: [oldBlog],
      works: [makeWork("old-work", "old", "2026-09-01")],
      notes: [],
    }
    expect(weekReport(oldInput, "2026-09-28").digest).toContain("老博客 已经 33 天没更新，订阅 +5。")
  })

  it("拿不到粉丝数的账号：粉丝一句不写，断更那句不写「订阅 +0」，行里标明拿不到", () => {
    // Umami 不给订阅数：每天粉丝为空，访问数每天 2
    const umami = makeAccount("u", "blog", { name: "技术博客" })
    const umamiInput = {
      dataset: {
        ...dataset,
        daily: {
          u: daysBetween("2026-09-20", "2026-10-07").map((day) => ({ day, followers: null, reads: 2, interactions: 0, posts: 0 })),
        },
        lastDays: { u: "2026-10-07" },
      },
      accounts: [umami],
      works: [makeWork("u-new", "u", "2026-09-29"), makeWork("u-old", "u", "2026-08-20")],
      notes: [],
    }
    const report = weekReport(umamiInput, "2026-09-28")
    expect(report.followersKnown).toBe(false)
    expect(report.rows.map((row) => [row.account.id, row.hasData, row.followersKnown, row.delta])).toEqual([["u", true, false, 0]])
    expect(report.totals).toEqual({ delta: 0, posts: 1, reads: 14, interactions: 0 })
    // 最后一篇 9-29 发的，离周末 5 天，不算断更；只有两句，没有「粉丝合计」
    expect(report.digest).toEqual(["这周发了 1 篇：博客 1 篇。", "浏览 14，比上周 0%。"])

    // 同一个号最后一篇是 9-01，周末时已经 33 天没更新：断更句不带订阅数
    const idle = { ...umamiInput, works: [makeWork("u-old", "u", "2026-09-01")] }
    expect(weekReport(idle, "2026-09-28").digest).toEqual(["这周还没有发布。", "浏览 14，比上周 0%。", "技术博客 已经 33 天没更新。"])
  })

  it("粉丝合计只算拿得到的账号：博客拿不到时知乎照常写，合计不受博客影响", () => {
    const umami = makeAccount("u", "blog", { name: "技术博客" })
    const mixed = {
      dataset: {
        ...dataset,
        daily: {
          ...dataset.daily,
          u: daysBetween("2026-09-20", "2026-10-07").map((day) => ({ day, followers: null, reads: 2, interactions: 0, posts: 0 })),
        },
        lastDays: { ...dataset.lastDays, u: "2026-10-07" },
      },
      accounts: [zhihu, umami],
      works: [],
      notes: [],
    }
    const report = weekReport(mixed, "2026-09-28")
    expect(report.followersKnown).toBe(true)
    expect(report.totals.delta).toBe(20)
    expect(report.rows.map((row) => [row.account.id, row.followersKnown, row.delta])).toEqual([
      ["a", true, 20],
      ["u", false, 0],
    ])
    expect(report.digest[1]).toBe("粉丝合计 +20，其中小叶（知乎）+20。")
  })

  it("周报合计的第二个数只算互动类账号；每一行照旧是账号自己的第二个数", () => {
    // 知乎每天互动 2，博客每天访客 1；混在一起时合计只算知乎的互动（视频号没有日数据，是 0）
    const report = weekReport(input, "2026-09-28")
    expect(report.rows.map((row) => [row.account.id, row.interactions])).toEqual([
      ["a", 14],
      ["b", 7],
      ["c", 0],
    ])
    expect(report.totals).toEqual({ delta: 25, posts: 3, reads: 105, interactions: 14 })

    // 只选博客时合计的就是访客
    const blogOnly = {
      dataset: { ...dataset, daily: { b: pointsFor("b") }, lastDays: { b: "2026-10-07" } },
      accounts: [blog],
      works: [makeWork("b-new", "b", "2026-10-03")],
      notes: [],
    }
    const blogReport = weekReport(blogOnly, "2026-09-28")
    expect(blogReport.rows.map((row) => [row.account.id, row.interactions])).toEqual([["b", 7]])
    expect(blogReport.totals).toEqual({ delta: 5, posts: 1, reads: 35, interactions: 7 })
  })

  it("后加进来但有旧数据的账号：周末之前有账号每天的数，或发过作品，那一周的分账号表就列它", () => {
    // 三个号都是 10-06 才加进来：新博客补了历史数据，旧作品号只有一篇 9-29 的作品，空号什么都没有
    const late = makeAccount("late", "blog", { name: "新博客", since: "2026-10-06" })
    const worksOnly = makeAccount("worksOnly", "bilibili", { name: "旧视频号", since: "2026-10-06" })
    const empty = makeAccount("empty", "xiaohongshu", { name: "空号", since: "2026-10-06" })
    const lateInput = {
      dataset: {
        ...dataset,
        daily: {
          late: daysBetween("2026-09-20", "2026-10-07").map((day) => ({ day, followers: null, reads: 1, interactions: 0, posts: 0 })),
        },
        lastDays: { late: "2026-10-07" },
      },
      accounts: [late, worksOnly, empty],
      works: [makeWork("old-video", "worksOnly", "2026-09-29")],
      notes: [],
    }
    const ids = (week: string) => weekReport(lateInput, week).rows.map((row) => row.account.id)

    // 周末 10-04：新博客有每天的数，旧视频号 9-29 发过作品；空号都没有
    expect(ids("2026-09-28")).toEqual(["late", "worksOnly"])
    const week = weekReport(lateInput, "2026-09-28")
    expect(week.totals).toEqual({ delta: 0, posts: 1, reads: 7, interactions: 0 })
    expect(week.digest[0]).toBe("这周发了 1 篇：B站 1 篇。")
    // 周末 9-27：作品还没发（9-29 才发），只剩新博客
    expect(ids("2026-09-21")).toEqual(["late"])
    // 周末 9-20：新博客的数据 9-20 才开始，正好算有
    expect(ids("2026-09-14")).toEqual(["late"])
    expect(weekReport(lateInput, "2026-09-14").totals.reads).toBe(1)
    // 周末 9-13：数据还没开始，三个号都不列
    expect(ids("2026-09-07")).toEqual([])
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
