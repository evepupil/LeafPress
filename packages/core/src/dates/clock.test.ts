import { expect, test } from "vitest"

import {
  addDays,
  addMinutes,
  dayOf,
  dayOfDate,
  daysBetween,
  diffDays,
  maxDay,
  minDay,
  timeMs,
  toIsoTime,
  weekStartOf,
  weekdayIndex,
} from "./clock.ts"

/** 本地偏移固定为 +08:00 时的基准日期 */
const baseDate = new Date(2026, 9, 8, 9, 30, 0)

test("toIsoTime：到秒、带本地偏移", () => {
  expect(toIsoTime(baseDate)).toBe("2026-10-08T09:30:00+08:00")
  expect(toIsoTime(new Date(2026, 9, 8, 9, 30, 0, 512))).toBe("2026-10-08T09:30:00+08:00")
  expect(toIsoTime(new Date(Date.UTC(2026, 9, 8, 1, 30, 0)))).toBe("2026-10-08T09:30:00+08:00")
})

test("toIsoTime：按运行时负偏移和半小时偏移格式化", () => {
  const previousTz = process.env.TZ
  const instant = new Date(Date.UTC(2026, 9, 8, 1, 30, 0))
  try {
    process.env.TZ = "America/New_York"
    expect(instant.getTimezoneOffset()).toBe(240)
    expect(toIsoTime(instant)).toBe("2026-10-07T21:30:00-04:00")

    process.env.TZ = "Asia/Kolkata"
    expect(instant.getTimezoneOffset()).toBe(-330)
    expect(toIsoTime(instant)).toBe("2026-10-08T07:00:00+05:30")
  } finally {
    if (previousTz === undefined) delete process.env.TZ
    else process.env.TZ = previousTz
  }
})

test("dayOfDate 和 dayOf：取本地日历日", () => {
  expect(dayOfDate(baseDate)).toBe("2026-10-08")
  expect(dayOfDate(new Date(Date.UTC(2026, 9, 8, 17, 0, 0)))).toBe("2026-10-09")
  expect(dayOf("2026-10-08T23:59:59+08:00")).toBe("2026-10-08")
})

test("timeMs：换回毫秒时间戳", () => {
  expect(timeMs("2026-10-08T09:30:00+08:00")).toBe(Date.UTC(2026, 9, 8, 1, 30, 0))
})

test("addMinutes：跨时、保留偏移", () => {
  expect(addMinutes("2026-10-08T09:30:00+08:00", 90)).toBe("2026-10-08T11:00:00+08:00")
  expect(addMinutes("2026-10-08T23:45:00+08:00", 30)).toBe("2026-10-09T00:15:00+08:00")
  expect(addMinutes("2026-10-08T00:00:00+08:00", -1)).toBe("2026-10-07T23:59:00+08:00")
  expect(addMinutes("2026-10-08T09:30:00+08:00", 0)).toBe("2026-10-08T09:30:00+08:00")
})

test("addDays：跨月、跨年、闰年", () => {
  expect(addDays("2026-10-08", 5)).toBe("2026-10-13")
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
  expect(addDays("2026-10-08", -8)).toBe("2026-09-30")
  expect(addDays("2026-10-08", 0)).toBe("2026-10-08")
})

test("diffDays：a 减 b 的天数", () => {
  expect(diffDays("2026-10-08", "2026-10-08")).toBe(0)
  expect(diffDays("2026-10-08", "2026-10-01")).toBe(7)
  expect(diffDays("2026-10-01", "2026-10-08")).toBe(-7)
  expect(diffDays("2027-01-01", "2026-12-31")).toBe(1)
})

test("weekdayIndex：周一 0 … 周日 6", () => {
  expect(weekdayIndex("2026-10-05")).toBe(0)
  expect(weekdayIndex("2026-10-08")).toBe(3)
  expect(weekdayIndex("2026-10-11")).toBe(6)
})

test("weekStartOf：周日算上一周", () => {
  expect(weekStartOf("2026-10-08")).toBe("2026-10-05")
  expect(weekStartOf("2026-10-05")).toBe("2026-10-05")
  expect(weekStartOf("2026-10-11")).toBe("2026-10-05")
  expect(weekStartOf("2026-10-04")).toBe("2026-09-28")
})

test("daysBetween：含两端；start 晚于 end 返回空数组", () => {
  expect(daysBetween("2026-10-08", "2026-10-08")).toEqual(["2026-10-08"])
  expect(daysBetween("2026-09-30", "2026-10-02")).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"])
  expect(daysBetween("2026-12-30", "2027-01-01")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"])
  expect(daysBetween("2026-10-09", "2026-10-08")).toEqual([])
})

test("minDay 和 maxDay", () => {
  expect(minDay("2026-10-08", "2026-09-30")).toBe("2026-09-30")
  expect(maxDay("2026-10-08", "2026-09-30")).toBe("2026-10-08")
  expect(minDay("2026-10-08", "2026-10-08")).toBe("2026-10-08")
})
