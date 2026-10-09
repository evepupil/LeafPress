import type { PlatformId } from "./platform.ts"

/** 步骤种类：AI 做（agent 做完用 `work step` 记下）、代码做（`work run` 执行）、要你动手（停在等你处理） */
export type StepKind = "ai" | "code" | "manual"

export interface WorkflowStep {
  /** 工作流内唯一，`^[a-z][a-z0-9-]*$`；代码步骤按「工作流编号 + 步骤编号」找实现 */
  id: string
  name: string
  kind: StepKind
  /** 用到的工具或 skill（给人看） */
  tool?: string
  /** 这一步在任务文件夹里留下的文件（相对任务文件夹）。AI 步骤 `work step` 时检查它们在不在 */
  produces?: string[]
  /** AI 步骤：写给 agent 的做法。{folder}、{platform}、{account} 换成实际值 */
  instructions?: string
  /** 要你动手的步骤：写给作者的话。{folder}、{platform}、{account} 换成实际值 */
  ask?: string
}

export interface WorkflowDef {
  id: string
  name: string
  /** 哪个平台用；"any" 是通用工作流，任何平台都能用 */
  platform: PlatformId | "any"
  /**
   * 适合从什么来：灵感（或直接新建）、博客作品、问题（灵感或新建，且要求里贴了这个平台的问题链接，按平台的 questionPattern 认）、什么都行
   */
  from: "idea" | "blog-work" | "question" | "any"
  summary: string
  steps: WorkflowStep[]
  /** 在 agent 里怎么说 */
  say: string
  /** 要用到的账号配置项（键）。有没配好的，这个账号暂时用不了这个工作流 */
  requires: string[]
}

/** 第几步现在是什么状态（按作品状态算出来，不存） */
export type StepState = "done" | "running" | "waiting" | "pending"
