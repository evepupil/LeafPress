import { describe, expect, it } from "vitest"

import {
  formatCount,
  formatDay,
  formatDayRelative,
  formatDayShort,
  formatDuration,
  formatPercent,
  formatRelative,
  formatSigned,
  formatSignedPercent,
  formatTime,
  formatWeekRange,
  weekdayLabel,
} from "./format"

describe("数字", () => {
  it("一万以内加千分位，以上用万、亿", () => {
    expect(formatCount(6842)).toBe("6,842")
    expect(formatCount(15620)).toBe("1.6万")
    expect(formatCount(100000)).toBe("10万")
    expect(formatCount(123456789)).toBe("1.2亿")
    expect(formatCount(-43)).toBe("−43")
    expect(formatCount(0)).toBe("0")
  })

  it("带正负号", () => {
    expect(formatSigned(312)).toBe("+312")
    expect(formatSigned(-11)).toBe("−11")
    expect(formatSigned(0)).toBe("0")
    expect(formatSigned(12000)).toBe("+1.2万")
  })

  it("百分比：不到 10% 留一位小数", () => {
    expect(formatPercent(0.183)).toBe("18%")
    expect(formatPercent(0.0123)).toBe("1.2%")
    expect(formatPercent(0)).toBe("0%")
    expect(formatSignedPercent(0.183)).toBe("+18%")
    expect(formatSignedPercent(-0.0567)).toBe("−5.7%")
    expect(formatSignedPercent(null)).toBe("—")
  })
})

describe("日期和时间", () => {
  it("日期：今年不写年份", () => {
    expect(formatDay("2026-10-08")).toBe("10月8日")
    expect(formatDay("2025-11-17")).toBe("2025年11月17日")
    expect(formatDayShort("2026-10-08")).toBe("10/8")
    expect(weekdayLabel("2026-10-08")).toBe("周四")
    expect(formatWeekRange("2026-09-28")).toBe("9月28日 – 10月4日")
    expect(formatTime("2026-10-08T06:00:12+08:00")).toBe("06:00")
  })

  it("相对演示时刻（10 月 8 日 09:30）", () => {
    expect(formatRelative("2026-10-08T09:25:00+08:00")).toBe("5 分钟前")
    expect(formatRelative("2026-10-08T06:00:00+08:00")).toBe("3 小时前")
    expect(formatRelative("2026-10-07T21:40:00+08:00")).toBe("昨天 21:40")
    expect(formatRelative("2026-10-05T08:00:00+08:00")).toBe("3 天前")
    expect(formatRelative("2026-09-26T10:12:00+08:00")).toBe("9月26日")
  })

  it("某天相对今天", () => {
    expect(formatDayRelative("2026-10-08")).toBe("今天")
    expect(formatDayRelative("2026-10-09")).toBe("明天")
    expect(formatDayRelative("2026-10-10")).toBe("2 天后")
    expect(formatDayRelative("2026-10-07")).toBe("昨天")
    expect(formatDayRelative("2026-10-02")).toBe("6 天前")
    expect(formatDayRelative("2026-09-29")).toBe("9月29日")
  })

  it("时长", () => {
    expect(formatDuration("2026-10-08T06:00:00+08:00", "2026-10-08T06:00:21+08:00")).toBe("21 秒")
    expect(formatDuration("2026-09-26T10:12:00+08:00", "2026-09-26T10:31:00+08:00")).toBe("19 分钟")
    expect(formatDuration("2026-09-24T09:00:00+08:00", "2026-09-24T10:20:00+08:00")).toBe("1 小时 20 分钟")
    expect(formatDuration("2026-09-08T20:00:00+08:00", "2026-09-10T09:20:00+08:00")).toBe("2 天")
  })
})
