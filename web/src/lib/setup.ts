import { PLATFORMS } from "@/data/accounts"
import { SETUP_ITEM_LABEL } from "@/data/labels"
import type { Account, DataSource, IsoTime, MetricDef, PullStatus, SetupItem, SetupState, Workflow } from "@/data/types"
import { workflowsFor } from "@/data/workflows"

/**
 * 一个账号接得怎么样。接一个平台要做两件事：作品产出的工作流、数据获取的工具；再加上这个平台的账号要配的东西。
 * - 有问题：原来能用的坏了（数据拉取失败、密钥过期）
 * - 没接完：还没有能用的工作流、拿数据的工具还没做、有配置没填
 * - 接好了：都不缺。额外的工作流还要配置（比如知乎回答）不算没接好，只列在「还缺什么」里
 * 全是纯函数。页面上填过的配置值（values）、页面上拉过一次的结果（pull）由调用方传进来。
 */

/** 页面上「现在拉一次」的结果，盖过数据快照里的那次 */
export interface PullRecord {
  status: PullStatus
  at: IsoTime
  reason?: string
}

export interface SetupView {
  workflows: Workflow[]
  readyWorkflows: number
  source: DataSource
  /** 能拿到的数据：这个平台作品的数据项 */
  metrics: MetricDef[]
  items: SetupItem[]
  state: SetupState
  /** 还缺什么，一句一样 */
  gaps: string[]
}

/** 把页面上填过的值合进去：填了（不是空白）就算配好 */
export function setupItems(account: Account, values: Record<string, string> = {}): SetupItem[] {
  return account.setup.map((item) => {
    const value = values[item.key]?.trim()
    return value ? { ...item, value, status: "ok" } : item
  })
}

/** 现在的数据获取情况：页面上拉过就用页面上的结果；还没接的永远是还没接 */
export function effectiveSource(account: Account, pull?: PullRecord): DataSource {
  const source = account.dataSource
  if (!pull || source.status === "missing") return source
  return {
    ...source,
    status: pull.status,
    lastPullAt: pull.at,
    ...(pull.status === "failed" ? { failReason: pull.reason ?? source.failReason } : { failReason: undefined, fixHint: undefined }),
  }
}

export function setupView(account: Account, values: Record<string, string> = {}, pull?: PullRecord): SetupView {
  const workflows = workflowsFor(account.platform)
  const readyWorkflows = workflows.filter((workflow) => workflow.status === "ready").length
  const items = setupItems(account, values)
  const source = effectiveSource(account, pull)

  const gaps: string[] = []
  if (readyWorkflows === 0) gaps.push("还没有能用的作品产出工作流")
  for (const workflow of workflows) if (workflow.status === "needs-setup") gaps.push(`「${workflow.name}」要配置`)
  if (source.status === "failed") gaps.push(`数据拉取失败：${source.failReason ?? source.provider}`)
  if (source.status === "missing") gaps.push("拿数据的工具还没做")
  for (const item of items) if (item.status !== "ok") gaps.push(`${item.label}${SETUP_ITEM_LABEL[item.status]}`)

  const broken = source.status === "failed" || items.some((item) => item.status === "expired")
  const unfinished = readyWorkflows === 0 || source.status === "missing" || items.some((item) => item.status === "missing")
  return {
    workflows,
    readyWorkflows,
    source,
    metrics: PLATFORMS[account.platform].metrics,
    items,
    state: broken ? "broken" : unfinished ? "unfinished" : "ready",
    gaps,
  }
}

export interface PullOutcome {
  accountId: string
  status: PullStatus
  reason?: string
}

/**
 * 拉一次数据（「现在拉一次」「重试」用）：拿数据的工具还没做的跳过；拉数据要的配置都配好才拉得到，
 * 否则失败，原因取数据来源上写的（博客：统计接口返回 401）。返回每个号的结果和给提示条的一句话。
 */
export function pullData(
  accounts: Account[],
  config: Record<string, Record<string, string>> = {},
): { outcomes: PullOutcome[]; note: string } {
  const outcomes: PullOutcome[] = []
  for (const account of accounts) {
    if (account.dataSource.status === "missing") continue
    const blocked = setupItems(account, config[account.id]).find((item) => item.usedFor === "data" && item.status !== "ok")
    outcomes.push(
      blocked
        ? {
            accountId: account.id,
            status: "failed",
            reason: account.dataSource.failReason ?? `${blocked.label}${SETUP_ITEM_LABEL[blocked.status]}`,
          }
        : { accountId: account.id, status: "ok" },
    )
  }
  const failed = outcomes.filter((item) => item.status === "failed")
  const nameOf = (id: string) => accounts.find((account) => account.id === id)?.name ?? id
  const note =
    outcomes.length === 0
      ? "没有能拉的账号"
      : failed.length === 0
        ? "全部入库"
        : `${failed.map((item) => `${nameOf(item.accountId)}：${item.reason}`).join("；")}${failed.length < outcomes.length ? "，其余已入库" : ""}`
  return { outcomes, note }
}
