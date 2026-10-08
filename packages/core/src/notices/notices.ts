import { PLATFORMS } from "../catalog/index.ts"
import { diffDays, timeMs } from "../dates/index.ts"
import { formatDay } from "../format/index.ts"
import type { Account, DayKey, IsoTime, PullRecord, Work } from "../types/index.ts"
import { workflowById } from "../workflows/index.ts"
import { publishedWorks } from "../metrics/common.ts"
import { waitingLabel } from "../works/index.ts"

export type NoticeKind = "waiting" | "data" | "stale"
export type NoticeTone = "risk" | "progress"

export interface Notice {
  id: string
  kind: NoticeKind
  tone: NoticeTone
  title: string
  detail: string
  href: string
  at: IsoTime
}

const KIND_ORDER: NoticeKind[] = ["data", "stale", "waiting"]

export function workHref(workId: string): string {
  return `/?open=${workId}`
}

export function accountHref(accountId: string): string {
  return `/account/?id=${encodeURIComponent(accountId)}`
}

function latestPulls(pulls: PullRecord[]): Map<string, PullRecord> {
  const latest = new Map<string, PullRecord>()
  for (const pull of pulls) {
    const previous = latest.get(pull.accountId)
    if (!previous || timeMs(pull.at) >= timeMs(previous.at)) latest.set(pull.accountId, pull)
  }
  return latest
}

function mostRecentWork(works: Work[], accountId: string): Work | undefined {
  return publishedWorks(works, accountId).sort(
    (a, b) =>
      (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  )[0]
}

export function notices(input: { works: Work[]; accounts: Account[]; pulls: PullRecord[]; today: DayKey }): Notice[] {
  const items: Notice[] = []
  const pulls = latestPulls(input.pulls)
  for (const account of input.accounts) {
    const pull = pulls.get(account.id)
    if (pull?.status === "failed") {
      items.push({
        id: `data:${account.id}`,
        kind: "data",
        tone: "risk",
        title: `${account.name}数据拉取失败`,
        detail: pull.reason ?? "",
        href: "/data/#sources",
        at: pull.at,
      })
    }

    if (account.stage !== "active") continue
    const last = mostRecentWork(input.works, account.id)
    if (!last?.publishedAt) continue
    const idle = diffDays(input.today, last.publishedAt)
    if (idle <= 14) continue
    items.push({
      id: `stale:${account.id}`,
      kind: "stale",
      tone: "risk",
      title: `${account.name} ${idle} 天没更新`,
      detail: `上次发布在${formatDay(last.publishedAt, input.today)}`,
      href: accountHref(account.id),
      at: last.updatedAt,
    })
  }

  for (const work of input.works) {
    if (work.status !== "waiting") continue
    const account = input.accounts.find((item) => item.id === work.accountId)
    if (!account) continue
    const workflow = workflowById(work.workflowId)
    items.push({
      id: `waiting:${work.id}`,
      kind: "waiting",
      tone: "progress",
      title: work.title,
      detail: `${PLATFORMS[account.platform].name} · ${workflow ? waitingLabel(work, workflow) : "等你处理"}`,
      href: workHref(work.id),
      at: work.updatedAt,
    })
  }

  return items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || timeMs(b.at) - timeMs(a.at))
}
