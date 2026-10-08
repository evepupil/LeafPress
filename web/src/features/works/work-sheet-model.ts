import { formatDay, formatRelative, type DayKey, type IsoTime, type Work, type WorkLog } from "@leafpress/core"

export const LOG_PREVIEW = 8

export interface LogRow {
  entry: WorkLog
  index: number
}

export function newestFirst(log: WorkLog[]): LogRow[] {
  return log.map((entry, index) => ({ entry, index })).sort((a, b) => b.entry.at.localeCompare(a.entry.at) || b.index - a.index)
}

export function timeText(work: Work, today: DayKey, now: IsoTime): string {
  const created = `创建 ${formatRelative(work.createdAt, now)}`
  return work.status === "done" && work.publishedAt ? `${created} · 发布 ${formatDay(work.publishedAt, today)}` : created
}
