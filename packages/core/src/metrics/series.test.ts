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
const dataset: MetricsDataset = { today: "2026-10-08", latestDay: "2026-10-07", daily: { a: points }, workDays: {} }
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
    expect(result.points[0]).toMatchObject({ key: "2026-09-10", label: "9/10", value: 1324, compare: 1278 })
    expect(result.points.at(-1)).toMatchObject({ key: "2026-10-07", label: "10/7", title: "10月7日 周三", value: 1378, compare: 1332 })
  })

  it("12 周按周取 12 点，最近一周截止昨天并对比 12 周前同周", () => {
    const result = metricSeries(input, "all", "followers", "12w")
    expect(result.change).toBeCloseTo((1378 - 1223) / 1223, 10)
    expect(result.points).toHaveLength(12)
    expect(result.points[0]).toMatchObject({ key: "2026-07-20", label: "7/20", value: 1242, compare: 1074 })
    expect(result.points.at(-1)).toMatchObject({
      key: "2026-10-05",
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
      title: "10月5日 – 10月11日",
      value: 583,
      compare: 500,
    })
    expect(metricSeries(mondayInput, "a", "reads", "12w").value).toBe(147)
  })
})
