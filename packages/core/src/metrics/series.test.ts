import { describe, expect, it } from "vitest"
import { daysBetween } from "../dates/index.ts"
import type { DailyPoint, MetricsDataset } from "../types/index.ts"
import { makeAccount, makeWork } from "./test-fixtures.ts"
import { metricSeries } from "./series.ts"
import { accountSummary } from "./summary.ts"

const account = makeAccount("a")
const points: DailyPoint[] = daysBetween("2026-04-01", "2026-10-07").map((day, index) => ({
  day,
  followers: 1000 + index * 2 + (index % 3) * 5,
  reads: (index % 11) + 1,
  interactions: (index % 5) + 1,
  posts: 0,
}))
const dataset: MetricsDataset = {
  today: "2026-10-08",
  latestDay: "2026-10-07",
  daily: { a: points },
  lastDays: { a: "2026-10-07" },
  workDays: {},
}
const works = [
  makeWork("may-post", "a", "2026-05-10"),
  makeWork("july-post", "a", "2026-07-14"),
  makeWork("window-post", "a", "2026-07-20"),
  makeWork("comparison-post", "a", "2026-08-20"),
  makeWork("range-post", "a", "2026-09-10"),
  makeWork("week-post", "a", "2026-10-05"),
  makeWork("today-post", "a", "2026-10-08"),
]
const input = { dataset, accounts: [account], works }

describe("指标走势", () => {
  it("4 周按天取 28 点，粉丝对比使用 28 天前的值", () => {
    const result = metricSeries(input, "a", "followers", "4w")
    expect(result.value).toBe(1378)
    expect(result.change).toBeCloseTo((1378 - 1332) / 1332, 10)
    expect(result.points).toHaveLength(28)
    expect(result.points[0]).toMatchObject({ key: "2026-09-10", end: "2026-09-10", label: "9/10", value: 1324, compare: 1278 })
    expect(result.points.at(-1)).toMatchObject({
      key: "2026-10-07",
      end: "2026-10-07",
      label: "10/7",
      title: "10月7日 周三",
      value: 1378,
      compare: 1332,
    })
  })

  it("12 周按周取 12 点，最近一周截止昨天并对比 12 周前同周", () => {
    const result = metricSeries(input, "all", "followers", "12w")
    expect(result.change).toBeCloseTo((1378 - 1223) / 1223, 10)
    expect(result.points).toHaveLength(12)
    expect(result.points[0]).toMatchObject({ key: "2026-07-20", end: "2026-07-26", label: "7/20", value: 1242, compare: 1074 })
    // 最近一周只有周一到周三，算到数据的最后一天
    expect(result.points.at(-1)).toMatchObject({
      key: "2026-10-05",
      end: "2026-10-07",
      label: "10/5",
      title: "10月5日 – 10月11日（到10月7日）",
      value: 1378,
      compare: 1210,
    })
  })

  it("流量按账号日数据统计，发布按已发布作品的日期统计", () => {
    const reads = metricSeries(input, "a", "reads", "4w")
    expect(reads.value).toBe(168)
    expect(reads.change).toBeCloseTo(3 / 165, 10)
    expect(reads.points[0]?.compare).toBe(3)
    expect(reads.points.at(-1)?.compare).toBe(8)

    const posts4w = metricSeries(input, "a", "posts", "4w")
    expect(posts4w.value).toBe(2)
    expect(posts4w.change).toBe(1)
    expect(posts4w.points.find((point) => point.key === "2026-09-10")).toMatchObject({ value: 1, compare: 0 })

    const posts12w = metricSeries(input, "a", "posts", "12w")
    expect(posts12w.value).toBe(4)
    expect(posts12w.change).toBe(1)
    expect(posts12w.points.at(-1)).toMatchObject({ value: 1, compare: 1 })
    const reads12 = metricSeries(input, "a", "reads", "12w")
    expect(reads12.points[0]).toMatchObject({ key: "2026-07-20", value: 28, compare: 56 })
    expect(reads12.points.at(-1)).toMatchObject({ key: "2026-10-05", value: 6, compare: 18 })
    expect(reads12.value).toBe(468)
    const mondayDates = daysBetween("2026-07-20", "2026-10-11")
    const mondayDataset: MetricsDataset = {
      today: "2026-10-12",
      latestDay: "2026-10-11",
      daily: {
        a: mondayDates.map((day, index) => ({
          day,
          followers: 500 + index,
          reads: day < "2026-07-27" ? 10 : 1,
          interactions: 0,
          posts: 0,
        })),
      },
      lastDays: { a: "2026-10-11" },
      workDays: {},
    }
    const mondayInput = {
      dataset: mondayDataset,
      accounts: [account],
      works: [
        makeWork("saturday-post", "a", "2026-10-10"),
        makeWork("sunday-post", "a", "2026-10-11"),
        makeWork("monday-post", "a", "2026-10-12"),
      ],
    }
    const summary = accountSummary(mondayInput, account)
    expect(summary.weeklyGain.at(-1)).toBe(7)
    expect(summary.postsThisWeek).toBe(1)
    const mondayFollowers = metricSeries(mondayInput, "a", "followers", "12w")
    expect(mondayFollowers.points[0]?.key).toBe("2026-07-20")
    expect(mondayFollowers.points.at(-1)).toMatchObject({
      key: "2026-10-05",
      end: "2026-10-11",
      title: "10月5日 – 10月11日",
      value: 583,
      compare: 500,
    })
    expect(metricSeries(mondayInput, "a", "reads", "12w").value).toBe(147)
  })
})

describe("拿不到粉丝的账号", () => {
  // 博客：Umami 只给访问数，每天粉丝为空；访问数每 4 天一个循环 1、2、3、4
  const blog = makeAccount("b", "blog")
  const blogPoints: DailyPoint[] = daysBetween("2026-04-01", "2026-10-07").map((day, index) => ({
    day,
    followers: null,
    reads: (index % 4) + 1,
    interactions: 0,
    posts: 0,
  }))
  const mixed = {
    dataset: { ...dataset, daily: { a: points, b: blogPoints }, lastDays: { a: "2026-10-07", b: "2026-10-07" } },
    accounts: [account, blog],
    works,
  }

  it("全部账号的粉丝线只加拿得到的账号，结果和只选知乎号完全一样", () => {
    const all = metricSeries(mixed, "all", "followers", "4w")
    expect(all.available).toBe(true)
    expect(all.value).toBe(1378)
    expect(all).toEqual(metricSeries(input, "a", "followers", "4w"))
    expect(metricSeries(mixed, "all", "followers", "12w")).toEqual(metricSeries(input, "a", "followers", "12w"))
  })

  it("选中的账号都拿不到粉丝时，粉丝一项标成没有，其余几项照常", () => {
    const followers = metricSeries(mixed, "b", "followers", "12w")
    expect(followers).toMatchObject({ metric: "followers", available: false, value: 0, change: null })
    // 80 天正好 20 个 1、2、3、4 的循环，每个循环 10
    const reads = metricSeries(mixed, "b", "reads", "12w")
    expect(reads).toMatchObject({ available: true, value: 200 })
    expect(metricSeries(mixed, "b", "interactions", "12w").available).toBe(true)
    expect(metricSeries(mixed, "b", "posts", "12w").available).toBe(true)
  })

  it("全部账号里一个都拿不到粉丝，或者选的账号没有任何数据，粉丝一项也是没有", () => {
    const blogOnly = { dataset: { ...dataset, daily: { b: blogPoints }, lastDays: { b: "2026-10-07" } }, accounts: [blog], works: [] }
    expect(metricSeries(blogOnly, "all", "followers", "4w").available).toBe(false)
    expect(metricSeries(blogOnly, "missing", "followers", "4w").available).toBe(false)
    expect(metricSeries({ ...blogOnly, accounts: [] }, "all", "followers", "4w").available).toBe(false)
  })
})

describe("第二个数：互动还是访客", () => {
  // 知乎每天互动 (index % 5) + 1；博客 daily 里存的第二个数是访客，每天 3
  const blogAccount = makeAccount("b", "blog")
  const blogVisitors = daysBetween("2026-04-01", "2026-10-07").map((day) => ({
    day,
    followers: null as number | null,
    reads: 10,
    interactions: 3,
    posts: 0,
  }))
  const mixed = {
    dataset: { ...dataset, daily: { a: points, b: blogVisitors }, lastDays: { a: "2026-10-07", b: "2026-10-07" } },
    accounts: [account, blogAccount],
    works: [],
  }

  it("混在一起时第二条线只算知乎的互动，和只选知乎号一样", () => {
    const all = metricSeries(mixed, "all", "interactions", "4w")
    expect(all).toEqual(metricSeries({ dataset, accounts: [account], works: [] }, "a", "interactions", "4w"))
  })

  it("只选博客时第二条线合计的是访客", () => {
    const blogOnly = metricSeries(mixed, "b", "interactions", "4w")
    // 28 天每天访客 3
    expect(blogOnly.value).toBe(84)
    expect(blogOnly.points.at(-1)).toMatchObject({ value: 3, compare: 3 })
  })
})
