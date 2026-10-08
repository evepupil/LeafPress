import type { Account, PlatformId, Work, WorkStatus } from "../types/index.ts"

export function makeAccount(id: string, platform: PlatformId = "zhihu", overrides: Partial<Account> = {}): Account {
  return {
    id,
    platform,
    name: id,
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: "profile.md",
    settings: [],
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: "2026-01-01T00:00:00+08:00",
    ...overrides,
  }
}

export function makeWork(
  id: string,
  accountId: string,
  publishedAt?: string,
  overrides: {
    status?: WorkStatus
    totals?: Record<string, number>
    workflowId?: string
    step?: number
    title?: string
    updatedAt?: string
  } = {},
): Work {
  const work: Work = {
    id,
    title: overrides.title ?? id,
    accountId,
    status: overrides.status ?? "done",
    brief: "",
    source: { kind: "none" },
    workflowId: overrides.workflowId ?? "general-write",
    step: overrides.step ?? 3,
    feedbackHistory: [],
    order: 1,
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00+08:00",
    tags: [],
    log: [],
  }
  if (publishedAt !== undefined) work.publishedAt = publishedAt
  if (overrides.totals !== undefined) work.totals = overrides.totals
  return work
}
