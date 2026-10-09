/**
 * Umami 按毫秒时间戳查数。这里把「某个时区的某一天」换成它的起止毫秒：
 * startAt = 那天当地 0 点，endAt = 次日当地 0 点减 1 毫秒（Umami 的区间含两端，减 1 毫秒才不会把次日 0 点的访问算进来）。
 */
import { UmamiRequestError } from "./errors.js";

export const DEFAULT_TIMEZONE = "Asia/Shanghai";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, value);
  }
  return value;
}

function parseDay(day: string): { year: number; month: number; date: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new UmamiRequestError("Umami 日期格式不对");
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    date: Number(match[3]),
  };
}

/** 那天在指定时区 0 点的毫秒时间戳 */
function localMidnight(day: string, timezone: string): number {
  const { year, month, date } = parseDay(day);
  const desiredAsUtc = Date.UTC(year, month - 1, date);
  let guess = desiredAsUtc;
  // 先把「当地时间」当 UTC 猜一个，再按猜出来的当地时间和目标的差修正；夏令时的地方最多修正两三轮
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = Object.fromEntries(
      formatter(timezone)
        .formatToParts(new Date(guess))
        .map((part) => [part.type, part.value]),
    );
    const localAsUtc = Date.UTC(
      Number(parts["year"]),
      Number(parts["month"]) - 1,
      Number(parts["day"]),
      Number(parts["hour"]),
      Number(parts["minute"]),
      Number(parts["second"]),
    );
    const adjustment = desiredAsUtc - localAsUtc;
    if (adjustment === 0) return guess;
    guess += adjustment;
  }
  return guess;
}

function nextDay(day: string): string {
  const { year, month, date } = parseDay(day);
  return new Date(Date.UTC(year, month - 1, date + 1))
    .toISOString()
    .slice(0, 10);
}

/** 某一天（日历日）在指定时区的起止毫秒 */
export function dayRangeInTimezone(
  day: string,
  timezone: string = DEFAULT_TIMEZONE,
): { startAt: number; endAt: number } {
  return {
    startAt: localMidnight(day, timezone),
    endAt: localMidnight(nextDay(day), timezone) - 1,
  };
}
