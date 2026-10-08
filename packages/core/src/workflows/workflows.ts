/**
 * 工作流挑选、可用性检查和任务说明里的占位符。
 * 挑选逻辑写成「在给定列表里挑」的内部函数，再包一个用目录 WORKFLOWS 的导出函数：
 * 接新平台时只往 WORKFLOWS 里加定义，不用改这里的规则。
 */
import { WORKFLOWS } from "../catalog/index.ts"
import type { PlatformId, SettingView, WorkflowDef, WorkSource } from "../types/index.ts"

/** {folder}、{platform}、{account} 的实际值 */
export interface StepVars {
  folder: string
  platform: string
  account: string
}

/**
 * 按「平台 + 来源」在给定的工作流列表里挑一个：平台专用的按列表顺序找第一个 from 对得上的，
 * 都对不上回落到通用工作流（platform 为 "any"）。
 * from 对得上：any 总对得上；idea 要求来源是灵感或直接新建；blog-work 要求来源是作品且来源作品在博客上。
 * 导出是为了测试能喂自造的列表；正常代码用 pickWorkflow（在目录 WORKFLOWS 里挑）。
 */
export function pickFromList(list: WorkflowDef[], platform: PlatformId, source: WorkSource, sourcePlatform?: PlatformId): WorkflowDef {
  const matching = (from: WorkflowDef["from"]): boolean => {
    if (from === "any") return true
    if (from === "idea") return source.kind === "idea" || source.kind === "none"
    if (from === "blog-work") return source.kind === "work" && sourcePlatform === "blog"
    return false
  }
  const special = list.find((workflow) => workflow.platform === platform && matching(workflow.from))
  const fallback = list.find((workflow) => workflow.platform === "any")
  // 列表里必须有通用工作流兜底；目录由 catalog 写定，一定有，自造的测试列表也一样要给
  if (!fallback) throw new Error("工作流列表里没有通用工作流")
  return special ?? fallback
}

/** 自动配：在整个工作流目录里挑（平台专用的在前，通用的在最后） */
export function pickWorkflow(platform: PlatformId, source: WorkSource, sourcePlatform?: PlatformId): WorkflowDef {
  return pickFromList(WORKFLOWS, platform, source, sourcePlatform)
}

/** 这个平台能换用的工作流：平台专用的在前（按 WORKFLOWS 里的顺序），通用的（platform 为 "any"）在后 */
export function workflowsFor(platform: PlatformId): WorkflowDef[] {
  const special = WORKFLOWS.filter((workflow) => workflow.platform === platform)
  const general = WORKFLOWS.filter((workflow) => workflow.platform === "any")
  // 专用的始终排在通用前面，即使目录里顺序写反了也成立
  return [...special, ...general]
}

/** 编号找工作流；没有就 undefined（找不到不抛错，调用方决定怎么提示） */
export function workflowById(id: string): WorkflowDef | undefined {
  return WORKFLOWS.find((workflow) => workflow.id === id)
}

/** 这个账号现在能不能用：requires 里的配置项在 settings 里都是 ok */
export function isUsable(workflow: WorkflowDef, settings: SettingView[]): boolean {
  return workflow.requires.every((key) => settings.some((setting) => setting.key === key && setting.status === "ok"))
}

/** 把 {folder}、{platform}、{account} 换成实际值，同一个占位符出现几次换几次 */
export function fillTemplate(text: string, vars: StepVars): string {
  return text.replaceAll(/\{folder\}|\{platform\}|\{account\}/g, (pattern) => vars[pattern.slice(1, -1) as keyof StepVars])
}
