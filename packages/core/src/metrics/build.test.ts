import { describe, expect, it } from "vitest"
import { addDays } from "../dates/index.ts"
import type { AccountDayRecord, WorkSnapshotRecord } from "../types/index.ts"
import { makeAccount, makeWork } from "./test-fixtures.ts"
import { buildDataset } from "./build.ts"

const today = "2026-10-08"
const accounts = [makeAccount("a", "zhihu"), makeAccount("b", "blog")]
const snapshot = (workId: string, day: string, totals: Record<string, number>): WorkSnapshotRecord => ({ workId, day, totals })

describe("buildDataset", () => {
  it("按快照差分、首条发布时间边界和窗口起点生成作品新增", () => {
    const works = [
      makeWork("normal", "a", "2026-10-01"),
      makeWork("published-day", "a", "2026-10-04"),
      makeWork("published-next", "a", "2026-10-04"),
      makeWork("pre-publish", "a", "2026-10-04"),
      makeWork("window", "a", "2026-07-01"),
      makeWork("outside-only", "a", "2026-04-07"),
      makeWork("late-first", "a", "2026-10-01"),
      makeWork("unfinished", "a", undefined, { status: "doing" }),
      makeWork("latest", "a", "2026-10-06"),
      makeWork("unknown-account", "missing", "2026-10-01"),
    ]
    const workSnapshots = [
      snapshot("normal", "2026-10-03", { views: 140, likes: 20 }),
      snapshot("normal", "2026-10-01", { views: 130, likes: 13 }),
      snapshot("normal", "2026-09-30", { views: 100, likes: 10 }),
      snapshot("normal", "2026-10-02", { views: 125, likes: 11 }),
      snapshot("published-day", "2026-10-04", { views: 7, likes: 2 }),
      snapshot("published-next", "2026-10-05", { views: 8, likes: 3 }),
      snapshot("pre-publish", "2026-10-04", { views: 55, likes: 8 }),
      snapshot("pre-publish", "2026-10-03", { views: 50, likes: 5 }),
      snapshot("window", "2026-04-09", { views: 150, likes: 14 }),
      snapshot("window", "2026-04-08", { views: 100, likes: 10 }),
      snapshot("outside-only", "2026-04-08", { views: 50, likes: 4 }),
      snapshot("late-first", "2026-10-04", { views: 100, likes: 10 }),
      snapshot("late-first", "2026-10-05", { views: 120, likes: 15 }),
      snapshot("unfinished", "2026-10-01", { views: 20, likes: 2 }),
      snapshot("unfinished", "2026-10-02", { views: 25, likes: 4 }),
      snapshot("latest", "2026-10-06", { views: 4, likes: 1 }),
      snapshot("latest", "2026-10-07", { views: 9, likes: 3 }),
      snapshot("unknown-account", "2026-10-01", { views: 90, likes: 9 }),
    ]
    const result = buildDataset({ today, accounts, works, accountDays: [], workSnapshots })

    expect(result.today).toBe("2026-10-08")
    expect(result.latestDay).toBe("2026-10-07")
    expect(result.workDays.normal).toEqual([
      { day: "2026-10-01", reads: 30, interactions: 3 },
      { day: "2026-10-03", reads: 15, interactions: 9 },
    ])
    expect(result.workDays["published-day"]).toEqual([{ day: "2026-10-04", reads: 7, interactions: 2 }])
    expect(result.workDays["published-next"]).toEqual([{ day: "2026-10-05", reads: 8, interactions: 3 }])
    expect(result.workDays["pre-publish"]).toEqual([{ day: "2026-10-04", reads: 5, interactions: 3 }])
    expect(result.workDays.window).toEqual([{ day: "2026-04-09", reads: 50, interactions: 4 }])
    expect(result.workDays["outside-only"]).toBeUndefined()
    expect(result.workDays["late-first"]).toEqual([{ day: "2026-10-05", reads: 20, interactions: 5 }])
    expect(result.workDays.unfinished).toEqual([{ day: "2026-10-02", reads: 5, interactions: 2 }])
    expect(result.workDays.latest).toEqual([
      { day: "2026-10-06", reads: 4, interactions: 1 },
      { day: "2026-10-07", reads: 5, interactions: 2 },
    ])
    expect(result.workDays["unknown-account"]).toBeUndefined()
  })

  it("账号从窗口内首条记录连续补到昨天，保留 null 粉丝并优先采用账号级数据", () => {
    const works = [
      makeWork("normal", "a", "2026-10-01"),
      makeWork("published-day", "a", "2026-10-04"),
      makeWork("published-next", "a", "2026-10-04"),
      makeWork("pre-publish", "a", "2026-10-04"),
      makeWork("post-without-snapshot", "a", "2026-10-02"),
    ]
    const accountDays: AccountDayRecord[] = [
      { accountId: "a", day: "2026-10-01", followers: 500, reads: null, interactions: null },
      { accountId: "a", day: "2026-10-03", followers: null, reads: 0, interactions: 99 },
      { accountId: "a", day: "2026-10-07", followers: 510, reads: 2, interactions: null },
      { accountId: "b", day: "2026-04-08", followers: 100, reads: null, interactions: null },
      { accountId: "b", day: "2026-04-09", followers: 200, reads: null, interactions: null },
      { accountId: "unknown", day: "2026-10-01", followers: 1, reads: 1, interactions: 1 },
    ]
    const workSnapshots = [
      snapshot("normal", "2026-10-01", { views: 30, likes: 3 }),
      snapshot("normal", "2026-10-03", { views: 45, likes: 12 }),
      snapshot("published-day", "2026-10-04", { views: 7, likes: 2 }),
      snapshot("published-next", "2026-10-05", { views: 8, likes: 3 }),
      snapshot("pre-publish", "2026-10-03", { views: 50, likes: 5 }),
      snapshot("pre-publish", "2026-10-04", { views: 55, likes: 8 }),
    ]
    const result = buildDataset({ today, accounts, works, accountDays, workSnapshots })
    const daily = result.daily.a

    expect(daily).toHaveLength(7)
    expect(daily?.slice(0, 5)).toEqual([
      { day: "2026-10-01", followers: 500, reads: 30, interactions: 3, posts: 1 },
      { day: "2026-10-02", followers: null, reads: 0, interactions: 0, posts: 1 },
      { day: "2026-10-03", followers: null, reads: 0, interactions: 99, posts: 0 },
      { day: "2026-10-04", followers: null, reads: 12, interactions: 5, posts: 3 },
      { day: "2026-10-05", followers: null, reads: 8, interactions: 3, posts: 0 },
    ])
    expect(daily?.at(-1)).toEqual({ day: "2026-10-07", followers: 510, reads: 2, interactions: 0, posts: 0 })
    expect(result.daily.b).toHaveLength(182)
    expect(result.daily.b?.[0]).toEqual({ day: "2026-04-09", followers: 200, reads: 0, interactions: 0, posts: 0 })
    expect(result.daily.unknown).toBeUndefined()
    expect(addDays("2026-10-08", -182)).toBe("2026-04-09")
  })
})
