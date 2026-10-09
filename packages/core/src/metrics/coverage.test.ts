import { describe, expect, it } from "vitest"
import type { DailyPoint, MetricsDataset } from "../types/index.ts"
import { followersKnown, hasMetricsData, lastDataDay } from "./coverage.ts"
import { makeAccount, makeWork } from "./test-fixtures.ts"

function point(day: string, followers: number | null, reads: number, interactions = 0): DailyPoint {
  return { day, followers, reads, interactions, posts: 0 }
}

// 知乎：只有 10-04 一天有真实记录（拉到了粉丝数），之后三天没拉，daily 补出来的 0；
// 博客：粉丝一直是空的，10-03 到 10-07 天天拉到了，10-06、10-07 访问确实是 0（真实记录，不是补的）；
// 安静号：粉丝是空的，10-06、10-07 拉到了，浏览互动全是 0
const dataset: MetricsDataset = {
  today: "2026-10-08",
  latestDay: "2026-10-07",
  daily: {
    zhihu: [point("2026-10-04", 500, 3, 1), point("2026-10-05", null, 0), point("2026-10-06", null, 0), point("2026-10-07", null, 0)],
    blog: [
      point("2026-10-03", null, 0),
      point("2026-10-04", null, 12),
      point("2026-10-05", null, 7),
      point("2026-10-06", null, 0),
      point("2026-10-07", null, 0),
    ],
    quiet: [point("2026-10-06", null, 0), point("2026-10-07", null, 0)],
  },
  lastDays: { zhihu: "2026-10-04", blog: "2026-10-07", quiet: "2026-10-07" },
  workDays: { "only-work": [{ day: "2026-10-06", reads: 4, interactions: 1 }] },
}

describe("粉丝拿不拿得到", () => {
  it("有任何一天的粉丝不是空的就是拿得到，一直是空的或没有数据都是拿不到", () => {
    expect(followersKnown(dataset, "zhihu")).toBe(true)
    expect(followersKnown(dataset, "blog")).toBe(false)
    expect(followersKnown(dataset, "quiet")).toBe(false)
    expect(followersKnown(dataset, "missing")).toBe(false)
  })

  it("前面都是空的、只有最后一天拿到粉丝数，也算拿得到", () => {
    const late: MetricsDataset = {
      ...dataset,
      daily: { late: [point("2026-10-06", null, 1), point("2026-10-07", 80, 1)] },
      lastDays: { late: "2026-10-07" },
    }
    expect(followersKnown(late, "late")).toBe(true)
  })
})

describe("数据到哪天", () => {
  it("取记录库里真实记录的最后一天，daily 补出来的天不算", () => {
    // 知乎的 daily 一直补到 10-07，但最后一次真正拉到是 10-04
    expect(dataset.daily["zhihu"]?.at(-1)?.day).toBe("2026-10-07")
    expect(lastDataDay(dataset, "zhihu")).toBe("2026-10-04")
  })

  it("拉到了但数是 0 也算数据到这天（博客一整天没人访问）", () => {
    expect(lastDataDay(dataset, "blog")).toBe("2026-10-07")
    expect(lastDataDay(dataset, "quiet")).toBe("2026-10-07")
  })

  it("窗口里没有记录的号是 null：没有账号的数据、只有作品的数据都一样", () => {
    expect(lastDataDay(dataset, "missing")).toBeNull()
    expect(lastDataDay(dataset, "workonly")).toBeNull()
  })
})

describe("有没有数", () => {
  const accounts = [
    makeAccount("zhihu"),
    makeAccount("blog", "blog"),
    makeAccount("quiet", "blog"),
    makeAccount("workonly", "bilibili"),
    makeAccount("empty", "xiaohongshu"),
  ]
  const works = [makeWork("only-work", "workonly", "2026-10-01"), makeWork("other-work", "empty", "2026-10-01")]
  const input = { dataset, accounts, works }

  it("不指定账号时看全部：账号每天或作品每天有一个就是有", () => {
    expect(hasMetricsData(input)).toBe(true)
    expect(hasMetricsData({ dataset: { ...dataset, daily: {}, lastDays: {}, workDays: {} }, accounts, works })).toBe(false)
    expect(hasMetricsData({ dataset: { ...dataset, daily: {}, lastDays: {} }, accounts, works })).toBe(true)
    expect(hasMetricsData({ dataset: { ...dataset, workDays: {} }, accounts, works })).toBe(true)
  })

  it("指定账号时只看这几个号自己的每天，和名下作品的每天", () => {
    expect(hasMetricsData(input, ["zhihu"])).toBe(true)
    expect(hasMetricsData(input, ["workonly"])).toBe(true)
    expect(hasMetricsData(input, ["empty"])).toBe(false)
    expect(hasMetricsData(input, ["empty", "blog"])).toBe(true)
    expect(hasMetricsData(input, ["missing"])).toBe(false)
    expect(hasMetricsData(input, [])).toBe(false)
  })

  it("别的账号的作品有新增不影响指定账号", () => {
    expect(hasMetricsData({ dataset: { ...dataset, daily: {}, lastDays: {} }, accounts, works }, ["empty"])).toBe(false)
  })
})
