import { SETTING_STATUS_LABEL } from "../labels/index.ts"
import { isUsable, workflowsFor } from "../workflows/index.ts"
import type { Account, DataSourceView, PlatformInfo, PullRecord, SettingView, SetupItemView, SetupView } from "../types/index.ts"

export interface SettingInput {
  values: Record<string, string>
  secrets: ReadonlySet<string>
  expired: Record<string, string>
}

/** 按平台定义的顺序生成设置状态；过期状态优先于已配置状态。 */
export function settingViews(platform: PlatformInfo, input: SettingInput): SettingView[] {
  return platform.setupItems.map((definition) => {
    if (Object.hasOwn(input.expired, definition.key)) {
      return { key: definition.key, status: "expired", reason: input.expired[definition.key] ?? "" }
    }
    if (definition.secret) {
      return input.secrets.has(definition.key) ? { key: definition.key, status: "ok" } : { key: definition.key, status: "missing" }
    }
    const value = input.values[definition.key]?.trim()
    return value ? { key: definition.key, status: "ok", value } : { key: definition.key, status: "missing" }
  })
}

/** 将状态与平台定义合并，忽略平台未定义的旧设置。 */
export function setupItems(platform: PlatformInfo, settings: SettingView[]): SetupItemView[] {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]))
  return platform.setupItems.map((definition) => {
    const setting = byKey.get(definition.key)
    const item: SetupItemView = { ...definition, status: setting?.status ?? "missing" }
    if (setting?.reason !== undefined) item.reason = setting.reason
    if (!definition.secret && setting?.value !== undefined) item.value = setting.value
    return item
  })
}

export function dataSourceView(platform: PlatformInfo, pull: PullRecord | undefined, schedule?: string): DataSourceView {
  if (!platform.dataTool) return { status: "missing", ...(schedule === undefined ? {} : { schedule }) }
  return {
    status: pull?.status === "failed" ? "failed" : "ok",
    mode: platform.dataTool.mode,
    provider: platform.dataTool.provider,
    ...(schedule === undefined ? {} : { schedule }),
    ...(pull?.status === "ok" ? { lastPullAt: pull.at } : {}),
    ...(pull?.status === "failed" ? { lastPullAt: pull.at, failReason: pull.reason, fixHint: pull.fixHint } : {}),
  }
}

export function setupView(account: Account, platform: PlatformInfo, input: { pull?: PullRecord; schedule?: string }): SetupView {
  const workflows = workflowsFor(platform.id)
  const items = setupItems(platform, account.settings)
  const usableWorkflows = workflows.filter((workflow) => isUsable(workflow, account.settings))
  const platformWorkflows = workflows.filter((workflow) => workflow.platform !== "any")
  const hasPlatformWorkflow = platformWorkflows.length > 0
  const source = dataSourceView(platform, input.pull, input.schedule)
  const gaps: string[] = []

  if (!hasPlatformWorkflow) gaps.push(`还没有${platform.name}专用的作品产出工作流`)
  for (const workflow of platformWorkflows) {
    if (isUsable(workflow, account.settings)) continue
    const missing = workflow.requires
      .filter((key) => !account.settings.some((setting) => setting.key === key && setting.status === "ok"))
      .map((key) => items.find((item) => item.key === key)?.label ?? key)
    gaps.push(`「${workflow.name}」要先配：${missing.join("、")}`)
  }
  if (source.status === "failed") gaps.push(`数据拉取失败：${source.failReason ?? "未知原因"}`)
  if (source.status === "missing") gaps.push("拿数据的工具还没做")
  for (const item of items) {
    if (item.status !== "ok") gaps.push(`${item.label}${SETTING_STATUS_LABEL[item.status]}`)
  }

  const broken = source.status === "failed" || items.some((item) => item.status === "expired")
  const unfinished =
    !hasPlatformWorkflow ||
    !platformWorkflows.some((workflow) => isUsable(workflow, account.settings)) ||
    source.status === "missing" ||
    items.some((item) => item.status === "missing")

  return {
    workflows,
    usableWorkflows,
    hasPlatformWorkflow,
    source,
    metrics: platform.metrics,
    items,
    state: broken ? "broken" : unfinished ? "unfinished" : "ready",
    gaps,
  }
}
