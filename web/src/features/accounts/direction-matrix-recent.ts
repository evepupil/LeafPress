import { LATEST_DAY, addDays } from "@/data/clock"
import { publishedWorks } from "@/lib/metrics"

/** 「近 N 天」的 N：窗口从最新一天往前数，含最新一天 */
export const RECENT_DAYS = 30

/** 这个号近 30 天（最新一天往前 29 天，到最新一天）已发的作品数，读的是数据快照 */
export function publishedRecently(accountId: string): number {
  const from = addDays(LATEST_DAY, 1 - RECENT_DAYS)
  return publishedWorks(accountId).filter(
    (work) => work.publishedAt !== undefined && work.publishedAt >= from && work.publishedAt <= LATEST_DAY,
  ).length
}
