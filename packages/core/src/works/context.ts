import { WORK_STATUS_LABEL, STEP_KIND_LABEL } from "../labels/index.ts"
import type { Account, PlatformInfo, TaskState, Work, WorkflowDef } from "../types/index.ts"
import { fillTemplate } from "../workflows/index.ts"
import { currentStep, progressText, stepState } from "./engine.ts"

export interface ContextSource {
  title: string
  url?: string
  localPath?: string
  folder?: string
}

export interface TaskContextInput {
  work: Work
  account: Account
  platform: PlatformInfo
  workflow: WorkflowDef
  folder: string
  source?: ContextSource
  files?: string[]
}

function feedbackTime(at: string): string {
  const month = Number(at.slice(5, 7))
  const day = Number(at.slice(8, 10))
  return `${month}月${day}日 ${at.slice(11, 16)}`
}

/** 为 agent、终端详情和任务说明文件生成同一份可读上下文。 */
export function taskContext(input: TaskContextInput): string {
  const { work, account, platform, workflow, folder } = input
  const lines = [
    `# 作品 ${work.id}：${work.title}`,
    "",
    `- 平台：${platform.name} · ${account.name}`,
    `- 状态：${WORK_STATUS_LABEL[work.status]}（${progressText(work, workflow)}）`,
    `- 工作流：${workflow.name}`,
    `- 任务文件夹：${folder}`,
  ]
  if (input.source) {
    const sourceParts = [
      input.source.url,
      input.source.localPath ? `本地 ${input.source.localPath}` : undefined,
      input.source.folder ? `任务文件夹 ${input.source.folder}` : undefined,
    ].filter((part): part is string => Boolean(part))
    lines.push(`- 来源：《${input.source.title}》${sourceParts.length ? `（${sourceParts.join("，")}）` : ""}`)
  }
  if (work.question) lines.push(`- 挂的问题：${work.question}`)
  if (work.url) lines.push(`- 链接：${work.url}`)
  lines.push("", "## 要求", "", work.brief || "（没有写）", "", "## 步骤", "")
  workflow.steps.forEach((step, index) => {
    const state = stepState(work, index)
    const mark = state === "done" ? "[x]" : state === "pending" ? "[ ]" : "[>]"
    lines.push(`${mark} ${index + 1}. ${step.name}（${STEP_KIND_LABEL[step.kind]}）`)
  })

  const step = currentStep(work, workflow)
  if (work.status === "doing" && step?.kind === "ai") {
    lines.push(
      "",
      "## 这一步怎么做",
      "",
      step.instructions ? fillTemplate(step.instructions, { folder, platform: platform.name, account: account.name }) : "",
    )
    if (step.produces?.length) {
      lines.push(`做完把 ${step.produces.join(", ")} 放进任务文件夹，然后运行 leafpress work step ${work.id}`)
    }
  } else if (work.status === "doing" && step?.kind === "code") {
    lines.push("", "## 这一步怎么做", "", `运行 leafpress work run ${work.id}`)
  }
  if (work.error) lines.push("", "## 出错了", "", work.error)
  if (work.ask) lines.push("", "## 等作者做的事", "", work.ask)
  if (work.feedback) lines.push("", "## 作者的反馈", "", work.feedback)
  if (work.feedbackHistory.length >= 2) {
    lines.push("", "## 反馈记录", "")
    for (const feedback of work.feedbackHistory) lines.push(`- ${feedbackTime(feedback.at)}（${feedback.stepName}）：${feedback.text}`)
  }
  if (input.files?.length) {
    lines.push("", "## 任务文件夹里的文件", "")
    for (const file of input.files) lines.push(`- ${file}`)
  }
  const profile = account.profile.trim()
  lines.push("", `## 账号档案（${account.profilePath}）`, "", profile || "（还没写，写之前先问作者这个号写给谁、怎么写）")
  return lines.join("\n")
}

/** 生成任务文件夹中的状态.json 数据，不读文件或当前时间。 */
export function taskState(work: Work, workflow: WorkflowDef, platform: PlatformInfo): TaskState {
  const step = currentStep(work, workflow)
  return {
    id: work.id,
    title: work.title,
    accountId: work.accountId,
    platform: platform.id,
    status: work.status,
    statusText: WORK_STATUS_LABEL[work.status],
    step: work.step,
    stepCount: workflow.steps.length,
    ...(step ? { currentStep: { id: step.id, name: step.name, kind: step.kind } } : {}),
    workflowId: work.workflowId,
    ...(work.ask === undefined ? {} : { ask: work.ask }),
    ...(work.feedback === undefined ? {} : { feedback: work.feedback }),
    ...(work.url === undefined ? {} : { url: work.url }),
    ...(work.lease === undefined ? {} : { lease: work.lease }),
    ...(work.error === undefined ? {} : { error: work.error }),
    updatedAt: work.updatedAt,
  }
}
