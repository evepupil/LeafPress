import type { BootstrapScheduleView } from "../api/index.ts"
import { PLATFORMS } from "../catalog/index.ts"
import { dayOf, diffDays, timeMs } from "../dates/index.ts"
import { formatDay, formatTime } from "../format/index.ts"
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

/** 定时任务装上了却超过这么久没运行，就提醒（一天半） */
const SCHEDULE_STALE_SECONDS = 36 * 3600
const SECONDS_PER_DAY = 86_400

/**
 * 某一刻比「today 当天 0 点」早多少秒。
 * 基准取 today 的 0 点，不取「现在」：结果只随 today 变，界面时钟走动不会让提醒忽有忽无；
 * 现在一定不早于今天 0 点，所以提醒一出现，实际没运行的时间一定已经超过 36 小时，不会提前报。
 * 时分按 IsoTime 自带的本地时间读（和 dayOf、formatTime 一致），不换时区。
 */
function secondsBeforeTodayStart(time: IsoTime, today: DayKey): number {
  const secondsOfDay = Number(time.slice(11, 13)) * 3600 + Number(time.slice(14, 16)) * 60 + Number(time.slice(17, 19))
  return diffDays(today, dayOf(time)) * SECONDS_PER_DAY - secondsOfDay
}

/** 读不出来的时间当作没有，免得算出乱码提醒 */
function readable(time: IsoTime | undefined): IsoTime | undefined {
  return time !== undefined && Number.isFinite(timeMs(time)) ? time : undefined
}

/**
 * 定时任务最后一次有动静的时刻：上次运行，或者装上（取较晚的）。
 * 重新装上的任务要从装上那一刻重新算，不能因为上一轮留下的 lastRunAt 很旧就立刻报警。
 */
function lastSign(schedule: BootstrapScheduleView): { kind: "ran" | "installed"; at: IsoTime } | undefined {
  const lastRunAt = readable(schedule.lastRunAt)
  const installedAt = readable(schedule.installedAt)
  if (installedAt !== undefined && (lastRunAt === undefined || timeMs(installedAt) > timeMs(lastRunAt))) {
    return { kind: "installed", at: installedAt }
  }
  return lastRunAt === undefined ? undefined : { kind: "ran", at: lastRunAt }
}

/** 装了的「定时拉数据」，从最后一次有动静起，到今天 0 点已超过 36 小时 → 一条风险提醒（有运行过和从没运行过两种说法） */
function scheduleNotice(schedule: BootstrapScheduleView, today: DayKey): Notice | undefined {
  if (schedule.id !== "data-pull" || !schedule.installed) return undefined
  const sign = lastSign(schedule)
  if (sign === undefined) return undefined
  if (secondsBeforeTodayStart(sign.at, today) <= SCHEDULE_STALE_SECONDS) return undefined
  const when = `${formatDay(dayOf(sign.at), today)} ${formatTime(sign.at)}`
  return {
    id: `data:schedule:${schedule.id}`,
    kind: "data",
    tone: "risk",
    title: "定时拉数据超过一天半没跑了",
    detail: sign.kind === "ran" ? `上次运行在 ${when}` : `装上后还没运行过，装上时间 ${when}`,
    href: "/workflows/",
    at: sign.at,
  }
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

export function notices(input: {
  works: Work[]
  accounts: Account[]
  pulls: PullRecord[]
  /** 定时任务：bootstrap 里的 schedules 原样传入（没带 installedAt 也行）。装了的拉数据任务，比的基准是 today 当天的 0 点，见 scheduleNotice */
  schedules: BootstrapScheduleView[]
  today: DayKey
}): Notice[] {
  const items: Notice[] = []
  for (const schedule of input.schedules) {
    const stale = scheduleNotice(schedule, input.today)
    if (stale) items.push(stale)
  }
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
