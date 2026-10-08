/**
 * 数字和时间的显示格式。所有界面都用这里的函数，不在组件里自己拼。
 * 时钟由调用方传进来：formatDay / formatRelative / formatDayRelative 多收一个「现在」参数，输出和原型一字不改。
 */
import { dayOf, diffDays, weekdayIndex } from "../dates/index.ts"
import type { DayKey, IsoTime } from "../types/index.ts"

const MINUS = "−"

/** 6842 → 6,842；15620 → 1.6万；100000 → 10万；123456789 → 1.2亿 */
export function formatCount(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? MINUS : ""
  if (abs >= 100_000_000) return `${sign}${trim(abs / 100_000_000)}亿`
  if (abs >= 10_000) return `${sign}${trim(abs / 10_000)}万`
  return `${sign}${abs.toLocaleString("en-US")}`
}

function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "")
}

/** +312 / −11 / 0 */
export function formatSigned(n: number): string {
  if (n > 0) return `+${formatCount(n)}`
  if (n < 0) return formatCount(n)
  return "0"
}

/** 0.183 → 18%；0.0123 → 1.2%（不到 10% 留一位小数） */
export function formatPercent(ratio: number): string {
  const pct = ratio * 100
  if (Math.abs(pct) < 10 && pct !== 0) return `${trim(pct)}%`
  return `${Math.round(pct)}%`
}

/** +18% / −6% / —（没有可比的数） */
export function formatSignedPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—"
  const text = formatPercent(Math.abs(ratio))
  if (ratio > 0) return `+${text}`
  if (ratio < 0) return `${MINUS}${text}`
  return "0%"
}

// split 出来的项在 noUncheckedIndexedAccess 下可能是 undefined；DayKey 约定格式固定，这里兜成 0
function parts(day: DayKey): [number, number, number] {
  const values = day.split("-").map(Number)
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
}

/** 2026-10-08 → 10月8日；不是今年（相对 today）的带年份 */
export function formatDay(day: DayKey, today: DayKey): string {
  const [y, m, d] = parts(day)
  const thisYear = parts(today)[0] ?? 0
  return y === thisYear ? `${m}月${d}日` : `${y}年${m}月${d}日`
}

/** 2026-10-08 → 10/8 */
export function formatDayShort(day: DayKey): string {
  const [, m, d] = parts(day)
  return `${m}/${d}`
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

/** 2026-10-08 → 周四 */
export function weekdayLabel(day: DayKey): string {
  // weekdayIndex 只会是 0..6，索引必有值；这里免得 noUncheckedIndexedAccess 报 undefined
  return WEEKDAYS[weekdayIndex(day)] ?? ""
}

/** 周一 2026-09-28 → 9月28日 – 10月4日 */
export function formatWeekRange(weekStart: DayKey): string {
  const [y, m, d] = parts(weekStart)
  const end = new Date(Date.UTC(y, m - 1, d + 6))
  return `${m}月${d}日 – ${end.getUTCMonth() + 1}月${end.getUTCDate()}日`
}

/** 显示 IsoTime 字符串携带偏移下的本地时分，不转换时区。 */
export function formatTime(time: IsoTime): string {
  return time.slice(11, 16)
}

/** 相对 now：刚刚 / 12 分钟前 / 3 小时前 / 昨天 21:40 / 3 天前 / 9月28日 */
export function formatRelative(time: IsoTime, now: IsoTime): string {
  const minutes = Math.round((new Date(now).getTime() - new Date(time).getTime()) / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const day = dayOf(time)
  const days = diffDays(dayOf(now), day)
  if (days === 0) return `${Math.floor(minutes / 60)} 小时前`
  if (days === 1) return `昨天 ${formatTime(time)}`
  if (days < 7) return `${days} 天前`
  return formatDay(day, dayOf(now))
}

/** 某天相对 today：今天 / 昨天 / 明天 / 3 天前 / 2 天后 / 9月28日（超过 7 天） */
export function formatDayRelative(day: DayKey, today: DayKey): string {
  const days = diffDays(today, day)
  if (days === 0) return "今天"
  if (days === 1) return "昨天"
  if (days === -1) return "明天"
  if (days > 1 && days < 7) return `${days} 天前`
  if (days < -1 && days > -7) return `${-days} 天后`
  return formatDay(day, today)
}

/** 两个时刻之间多久：21 秒 / 14 分钟 / 1 小时 20 分钟 / 2 天 */
export function formatDuration(from: IsoTime, to: IsoTime): string {
  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
  }
  return `${Math.round(hours / 24)} 天`
}
