import { describe, expect, it } from "vitest"
import { daysBetween } from "../dates/index.ts"
import type { DailyPoint, MetricsDataset } from "../types/index.ts"
import { accountLabel, followersAt, followersOn, metricText, publishedWorks, rankableWorks, shortTitle, sumFlow } from "./common.ts"
import { accountSummary } from "./summary.ts"
import { rankedWork, topWorks } from "./rank.ts"
import { makeAccount, makeWork } from "./test-fixtures.ts"

describe("粉丝与流量基础统计", () => {
  const points: DailyPoint[] = [
    { day: "2026-10-01", followers: 500, reads: 3, interactions: 1, posts: 0 },
    { day: "2026-10-02", followers: null, reads: 4, interactions: 2, posts: 1 },
    { day: "2026-10-03", followers: null, reads: 5, interactions: 1, posts: 0 },
    { day: "2026-10-04", followers: 510, reads: 6, interactions: 2, posts: 0 },
  ]
  const dataset: MetricsDataset = {
    today: "2026-10-08",
    latestDay: "2026-10-07",
    daily: { a: points },
    lastDays: { a: "2026-10-04" },
    workDays: {},
  }

  it("粉丝空洞取最近观测，早于首次观测沿用首次值，从未观测返回零", () => {
    expect(followersOn(dataset, "a", "2026-10-03")).toBe(500)
    expect(followersOn(dataset, "a", "2026-10-07")).toBe(510)
    expect(followersOn(dataset, "a", "2026-09-30")).toBeNull()
    expect(followersOn(dataset, "a", "2026-10-20")).toBe(510)
    expect(followersAt(dataset, "a", "2026-09-30")).toBe(500)
    expect(followersAt(dataset, "missing", "2026-09-30")).toBe(0)
  })

  it("按闭区间累加账号日流量", () => {
    expect(sumFlow(dataset, "a", "2026-10-02", "2026-10-04", "reads")).toBe(15)
    expect(sumFlow(dataset, "a", "2026-10-02", "2026-10-04", "interactions")).toBe(5)
    expect(sumFlow(dataset, "a", "2026-10-02", "2026-10-04", "posts")).toBe(1)
    expect(sumFlow(dataset, "missing", "2026-10-02", "2026-10-04", "reads")).toBe(0)
  })
})

describe("账号概况", () => {
  const account = makeAccount("a", "zhihu", { name: "小叶" })
  const noData = makeAccount("b", "blog", { name: "新博客" })
  const stale = makeAccount("c", "blog", { stage: "active" })
  const daily: DailyPoint[] = daysBetween("2026-07-19", "2026-10-07").map((day, index) => ({
    day,
    followers: 1000 + index * 5 + (index % 4) * 2,
    reads: (index % 9) + 1,
    interactions: (index % 5) + 1,
    posts: 0,
  }))
  const dataset: MetricsDataset = {
    today: "2026-10-08",
    latestDay: "2026-10-07",
    daily: { a: daily },
    lastDays: { a: "2026-10-07" },
    workDays: {},
  }
  const works = [
    makeWork("today-post", "a", "2026-10-08"),
    makeWork("week-post", "a", "2026-10-06"),
    makeWork("old-post", "a", "2026-09-20"),
    makeWork("no-data-post", "b", "2026-10-06"),
    makeWork("stale-post", "c", "2026-09-20"),
  ]

  it("粉絲變化以首次观测作基线；周增减固定返回 12 项", () => {
    const summary = accountSummary({ dataset, accounts: [account, noData, stale], works }, account)
    expect(summary.hasData).toBe(true)
    expect(summary.followers).toBe(1400)
    expect(summary.followers7d).toBe(33)
    expect(summary.followers30d).toBe(146)
    expect(summary.reads7d).toBe(42)
    expect(summary.readsChange).toBeCloseTo(4 / 38, 10)
    expect(summary.interactions7d).toBe(21)
    expect(summary.postsThisWeek).toBe(2)
    expect(summary.works).toBe(3)
    expect(summary.lastPublishedAt).toBe("2026-10-08")
    expect(summary.daysSincePublish).toBe(0)
    expect(summary.weeklyGain).toEqual([41, 33, 33, 33, 41, 33, 33, 33, 41, 33, 33, 13])
    expect(summary.stale).toBe(false)
    expect(summary.followersKnown).toBe(true)
    expect(summary.dataThrough).toBe("2026-10-07")
  })

  // Umami 不给订阅数，每天粉丝为空；访问数 10-04 及以前每天 5，之后每天 0
  const umami = makeAccount("umami", "blog", { name: "技术博客" })
  const umamiDaily = daysBetween("2026-09-20", "2026-10-07").map((day) => ({
    day,
    followers: null,
    reads: day <= "2026-10-04" ? 5 : 0,
    interactions: 0,
    posts: 0,
  }))

  it("博客拿不到粉丝数：followersKnown 为 false，数据到记录库里真实记录的最后一天", () => {
    // 记录只到 10-04，之后三天没拉到，daily 里是补出来的 0
    const blogDataset: MetricsDataset = {
      today: "2026-10-08",
      latestDay: "2026-10-07",
      daily: { umami: umamiDaily },
      lastDays: { umami: "2026-10-04" },
      workDays: {},
    }
    const summary = accountSummary({ dataset: blogDataset, accounts: [umami], works: [] }, umami)
    expect(summary.hasData).toBe(true)
    expect(summary.followersKnown).toBe(false)
    expect(summary.dataThrough).toBe("2026-10-04")
    expect(summary).toMatchObject({ followers: 0, followers7d: 0, followers30d: 0 })
    expect(summary.weeklyGain).toEqual(Array.from({ length: 12 }, () => 0))
    expect(summary.reads7d).toBe(20)
    expect(summary.readsChange).toBeCloseTo(-3 / 7, 10)
  })

  it("最后几天拉到了、访问确实是 0：数据到仍是最后一天，和 daily 里的 0 无关", () => {
    // daily 和上一条完全一样，区别只在记录库里 10-05 到 10-07 有真实记录行
    const blogDataset: MetricsDataset = {
      today: "2026-10-08",
      latestDay: "2026-10-07",
      daily: { umami: umamiDaily },
      lastDays: { umami: "2026-10-07" },
      workDays: {},
    }
    const summary = accountSummary({ dataset: blogDataset, accounts: [umami], works: [] }, umami)
    expect(summary.dataThrough).toBe("2026-10-07")
    expect(summary.reads7d).toBe(20)
  })

  it("没有数据但已发布的作品仍计入作品数和本周发布；运营中超过 14 天才断更", () => {
    const input = { dataset, accounts: [account, noData, stale], works }
    const summary = accountSummary(input, noData)
    expect(summary.hasData).toBe(false)
    expect(summary.followersKnown).toBe(false)
    expect(summary.dataThrough).toBeNull()
    expect(summary.followers).toBe(0)
    expect(summary.works).toBe(1)
    expect(summary.postsThisWeek).toBe(1)
    expect(summary.lastPublishedAt).toBe("2026-10-06")
    expect(accountSummary(input, stale).stale).toBe(true)
    const fourteen = makeAccount("fourteen", "blog", { stage: "active" })
    const fifteen = makeAccount("fifteen", "blog", { stage: "active" })
    const paused = makeAccount("paused", "blog", { stage: "paused" })
    const staleInput = {
      ...input,
      accounts: [...input.accounts, fourteen, fifteen, paused],
      works: [
        ...input.works,
        makeWork("fourteen-days", fourteen.id, "2026-09-24"),
        makeWork("fifteen-days", fifteen.id, "2026-09-23"),
        makeWork("paused-old-work", paused.id, "2026-09-01"),
      ],
    }
    expect(accountSummary(staleInput, fourteen).stale).toBe(false)
    expect(accountSummary(staleInput, fifteen).stale).toBe(true)
    expect(accountSummary(staleInput, paused)).toMatchObject({ stale: false, works: 1, lastPublishedAt: "2026-09-01" })
    expect(accountSummary(input, makeAccount("paused", "blog", { stage: "paused" })).stale).toBe(false)
  })
})

describe("作品排行和平台数据项", () => {
  const account = makeAccount("a")
  const first = makeWork("a-work", "a", "2026-10-01", { totals: { views: 100, likes: 5, collects: 10 } })
  const second = makeWork("b-work", "a", "2026-10-02", { totals: { views: 100, likes: 20 } })
  const third = makeWork("c-work", "a", "2026-10-03", { totals: { views: 80, likes: 20 } })
  const missingTotals = makeWork("d-work", "a", "2026-10-04")
  const noDate = makeWork("e-work", "a", undefined, { totals: { views: 999 } })
  const unfinished = makeWork("f-work", "a", "2026-10-05", { status: "todo", totals: { views: 1000 } })
  const works = [second, first, third, missingTotals, noDate, unfinished]
  const days = (reads: number) => [
    { day: "2026-09-30", reads: 1000, interactions: 0 },
    ...daysBetween("2026-10-01", "2026-10-07").map((day) => ({ day, reads, interactions: 0 })),
  ]
  const dataset: MetricsDataset = {
    today: "2026-10-08",
    latestDay: "2026-10-07",
    daily: {},
    lastDays: {},
    workDays: { "a-work": days(1), "b-work": days(1), "c-work": days(2) },
  }
  const input = { dataset, accounts: [account], works }

  it("已发布作品和可排行作品区分累计数据", () => {
    expect(publishedWorks(works).map((work) => work.id)).toEqual(["b-work", "a-work", "c-work", "d-work"])
    expect(rankableWorks(works).map((work) => work.id)).toEqual(["b-work", "a-work", "c-work"])
  })

  it("主数据、互动、近 7 天增长排序及并列顺序稳定", () => {
    expect(topWorks(input, "reach").map((item) => item.work.id)).toEqual(["a-work", "b-work", "c-work"])
    expect(topWorks(input, "interactions").map((item) => item.work.id)).toEqual(["b-work", "c-work", "a-work"])
    expect(topWorks(input, "growth").map((item) => item.work.id)).toEqual(["c-work", "a-work", "b-work"])
    expect(topWorks(input, "reach", 2, "a")).toHaveLength(2)
    expect(topWorks(input, "reach", 10, "missing")).toEqual([])
    expect(rankedWork(dataset, first, account)).toMatchObject({ reach: 100, interactions: 15, growth: 7, rate: 0.15 })
    expect(rankedWork(dataset, missingTotals, account)).toMatchObject({ reach: 0, interactions: 0, rate: null })
  })

  it("作品标题、账号标签和各平台数据项格式化", () => {
    expect(shortTitle("标题：后半句")).toBe("标题")
    expect(accountLabel(account)).toBe("a（知乎）")
    expect(metricText(first, "zhihu", "views")).toBe("100")
    expect(metricText(first, "zhihu", "comments")).toBe("0")
    expect(metricText(first, "zhihu", "pageviews")).toBe("—")
    expect(metricText(missingTotals, "zhihu", "views")).toBe("—")
  })
})
