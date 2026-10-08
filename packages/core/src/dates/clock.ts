/**
 * 日期和时间：本地日历日（DayKey）与带本地时区偏移的时刻（IsoTime）之间的换算、日历日加减。
 * 日历日的加减用 UTC 日期算（Date.UTC），不受夏令时影响；时钟由调用方传进来，这里不取当前时间。
 */
import type { DayKey, IsoTime } from "../types/index.ts"

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

/** Date → 本地时区的 IsoTime：到秒，偏移取运行环境的设置（例如 +08:00）。毫秒舍弃，同一秒的两个时刻格式化出的字符串才一致 */
export function toIsoTime(date: Date): IsoTime {
  const ms = Math.floor(date.getTime() / 1000) * 1000
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? "-" : "+"
  const abs = Math.abs(offsetMinutes)
  const offset = `${sign}${String(Math.trunc(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`
  const local = new Date(ms + offsetMinutes * MINUTE_MS)
  return `${local.toISOString().slice(0, 19)}${offset}`
}

/** Date → 本地日历日 */
export function dayOfDate(date: Date): DayKey {
  return toIsoTime(date).slice(0, 10)
}

/** IsoTime → 日历日：偏移约定是本地的，直接取前 10 个字符就是本地日期 */
export function dayOf(time: IsoTime): DayKey {
  return time.slice(0, 10)
}

/** IsoTime → 毫秒时间戳（租约到期这类比较用毫秒，不比字符串） */
export function timeMs(time: IsoTime): number {
  return new Date(time).getTime()
}

/** 某一刻往后 n 分钟；结果保留输入的偏移，不换成运行环境的时区 */
export function addMinutes(time: IsoTime, minutes: number): IsoTime {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(time)
  const offsetMinutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0
  const shifted = new Date(timeMs(time) + minutes * MINUTE_MS + offsetMinutes * MINUTE_MS)
  const offset = match ? `${match[1]}${match[2]}:${match[3]}` : "Z"
  return `${shifted.toISOString().slice(0, 19)}${offset}`
}

// split 出来的项在 noUncheckedIndexedAccess 下可能是 undefined；DayKey 约定格式固定，这里兜成 0
function dayParts(day: DayKey): [number, number, number] {
  const values = day.split("-").map(Number)
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
}

function toUtc(day: DayKey): number {
  const [y, m, d] = dayParts(day)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10)
}

/** 某天往后（正数）或往前（负数）n 天 */
export function addDays(day: DayKey, n: number): DayKey {
  return fromUtc(toUtc(day) + n * DAY_MS)
}

/** a 减 b 的天数（a 比 b 晚为正） */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS)
}

/** 那天是周几：周一 0 … 周日 6 */
export function weekdayIndex(day: DayKey): number {
  return (new Date(toUtc(day)).getUTCDay() + 6) % 7
}

/** 那一周的周一 */
export function weekStartOf(day: DayKey): DayKey {
  return addDays(day, -weekdayIndex(day))
}

/** 从 start 到 end 的每一天（含两端）；start 晚于 end 时返回空数组 */
export function daysBetween(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) out.push(day)
  return out
}

export function minDay(a: DayKey, b: DayKey): DayKey {
  return a <= b ? a : b
}

export function maxDay(a: DayKey, b: DayKey): DayKey {
  return a >= b ? a : b
}
