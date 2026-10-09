import { addDays, daysBetween } from "../dates/index.ts"
import { PLATFORMS } from "../catalog/index.ts"
import type { Account, AccountDayRecord, DayKey, MetricsDataset, PlatformId, Work, WorkDay, WorkSnapshotRecord } from "../types/index.ts"

export const DATASET_DAYS = 182

function counts(platformId: PlatformId, totals: Record<string, number>): { reads: number; interactions: number } {
  const platform = PLATFORMS[platformId]
  return {
    reads: totals[platform.metrics[0]?.key ?? ""] ?? 0,
    interactions: platform.metrics.filter((metric) => metric.interaction).reduce((sum, metric) => sum + (totals[metric.key] ?? 0), 0),
  }
}

function nonNegative(value: number): number {
  return Math.max(0, value)
}

export function buildDataset(input: {
  today: DayKey
  accounts: Account[]
  works: Work[]
  accountDays: AccountDayRecord[]
  workSnapshots: WorkSnapshotRecord[]
}): MetricsDataset {
  const latestDay = addDays(input.today, -1)
  const start = addDays(input.today, -DATASET_DAYS)
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]))
  const worksById = new Map(input.works.map((work) => [work.id, work]))
  const snapshotsByWork = new Map<string, WorkSnapshotRecord[]>()
  for (const snapshot of input.workSnapshots) {
    const group = snapshotsByWork.get(snapshot.workId) ?? []
    group.push(snapshot)
    snapshotsByWork.set(snapshot.workId, group)
  }

  const workDays: Record<string, WorkDay[]> = {}
  for (const [workId, snapshots] of snapshotsByWork) {
    const work = worksById.get(workId)
    const account = work && accountsById.get(work.accountId)
    if (!work || !account) continue
    const sorted = [...snapshots].sort((a, b) => a.day.localeCompare(b.day))
    const daily: WorkDay[] = []
    for (let index = 0; index < sorted.length; index++) {
      const snapshot = sorted[index]
      if (!snapshot || snapshot.day < start || snapshot.day > latestDay) continue
      const current = counts(account.platform, snapshot.totals)
      const previous = index === 0 ? undefined : sorted[index - 1]
      let reads = 0
      let interactions = 0
      if (previous) {
        const previousCounts = counts(account.platform, previous.totals)
        reads = nonNegative(current.reads - previousCounts.reads)
        interactions = nonNegative(current.interactions - previousCounts.interactions)
      } else if (work.publishedAt && work.publishedAt <= snapshot.day && snapshot.day <= addDays(work.publishedAt, 1)) {
        reads = current.reads
        interactions = current.interactions
      }
      if (reads !== 0 || interactions !== 0) daily.push({ day: snapshot.day, reads, interactions })
    }
    if (daily.length > 0) workDays[workId] = daily
  }

  const publishedByAccountDay = new Map<string, number>()
  for (const work of input.works) {
    if (work.status !== "done" || !work.publishedAt) continue
    const key = `${work.accountId}:${work.publishedAt}`
    publishedByAccountDay.set(key, (publishedByAccountDay.get(key) ?? 0) + 1)
  }
  const workFlowByAccountDay = new Map<string, { reads: number; interactions: number }>()
  for (const [workId, points] of Object.entries(workDays)) {
    const work = worksById.get(workId)
    if (!work) continue
    for (const point of points) {
      const key = `${work.accountId}:${point.day}`
      const sum = workFlowByAccountDay.get(key) ?? { reads: 0, interactions: 0 }
      sum.reads += point.reads
      sum.interactions += point.interactions
      workFlowByAccountDay.set(key, sum)
    }
  }

  const accountDaysById = new Map<string, AccountDayRecord[]>()
  for (const record of input.accountDays) {
    if (record.day < start || record.day > latestDay) continue
    const group = accountDaysById.get(record.accountId) ?? []
    group.push(record)
    accountDaysById.set(record.accountId, group)
  }
  const daily: MetricsDataset["daily"] = {}
  const lastDays: MetricsDataset["lastDays"] = {}
  for (const [accountId, records] of accountDaysById) {
    if (!accountsById.has(accountId) || records.length === 0) continue
    records.sort((a, b) => a.day.localeCompare(b.day))
    const first = records[0]
    const last = records[records.length - 1]
    if (!first || !last) continue
    // 真实记录的最后一天：daily 补出来的天不算（窗口外的记录已在上面分组时筛掉）
    lastDays[accountId] = last.day
    const byDay = new Map(records.map((record) => [record.day, record]))
    daily[accountId] = daysBetween(first.day, latestDay).map((day) => {
      const record = byDay.get(day)
      const workFlow = workFlowByAccountDay.get(`${accountId}:${day}`) ?? { reads: 0, interactions: 0 }
      return {
        day,
        followers: record?.followers ?? null,
        reads: record?.reads ?? workFlow.reads,
        interactions: record?.interactions ?? workFlow.interactions,
        posts: publishedByAccountDay.get(`${accountId}:${day}`) ?? 0,
      }
    })
  }

  return { today: input.today, latestDay, daily, lastDays, workDays }
}
