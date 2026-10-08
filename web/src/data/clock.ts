import type { DayKey, IsoTime } from "./types"

/**
 * 演示用的固定当前时刻。所有「今天」「本周」「几天前」都从这里算，
 * 截图和交互检查每次看到的结果一样。换成真数据时改成取当前时间。
 */
export const DEMO_NOW: IsoTime = "2026-10-08T09:30:00+08:00"
export const TODAY: DayKey = "2026-10-08"
/** 每天 06:00 拉前一天的数据，所以最新一天是昨天 */
export const LATEST_DAY: DayKey = "2026-10-07"
/** 本周一 */
export const THIS_WEEK: DayKey = "2026-10-05"
/** 上周一：周报默认看这一周 */
export const LAST_WEEK: DayKey = "2026-09-28"
/** 数据从这天开始生成（24 周前的周一），够算「近 12 周」和它的上一期 */
export const SERIES_START: DayKey = "2026-04-20"

const DAY_MS = 86_400_000

function toUtc(day: DayKey): number {
  const [y, m, d] = day.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(day: DayKey, n: number): DayKey {
  return fromUtc(toUtc(day) + n * DAY_MS)
}

/** a 比 b 晚几天（a - b） */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS)
}

/** 0 = 周一 … 6 = 周日 */
export function weekdayIndex(day: DayKey): number {
  return (new Date(toUtc(day)).getUTCDay() + 6) % 7
}

export function weekStartOf(day: DayKey): DayKey {
  return addDays(day, -weekdayIndex(day))
}

/** 从 start 到 end（含两端）的每一天 */
export function daysBetween(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) out.push(day)
  return out
}

/** 带时区的时间 → 北京时间的日历日 */
export function dayOf(time: IsoTime): DayKey {
  return new Date(new Date(time).getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

/** 某一刻往后 n 分钟，结果统一写成北京时间 */
export function addMinutes(time: IsoTime, n: number): IsoTime {
  const shifted = new Date(new Date(time).getTime() + n * 60_000 + 8 * 3_600_000)
  return `${shifted.toISOString().slice(0, 19)}+08:00`
}

/** 某一刻距离 DEMO_NOW 多少分钟（过去为正） */
export function minutesAgo(time: IsoTime): number {
  return Math.round((new Date(DEMO_NOW).getTime() - new Date(time).getTime()) / 60_000)
}

/** 某天距离今天几天（过去为正） */
export function daysAgo(day: DayKey): number {
  return diffDays(TODAY, day)
}
