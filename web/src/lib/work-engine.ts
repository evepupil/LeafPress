import { PLATFORMS, accountById, profilePath } from "@/data/accounts"
import { dayOf } from "@/data/clock"
import type { Idea, IsoTime, StepKind, Work, WorkSource, WorkStatus } from "@/data/types"
import { pickWorkflow, workflowById } from "@/data/workflows"
import { taskFolder } from "@/data/works"

/**
 * 作品（任务）怎么往前走。全是纯函数：给一个作品，返回新的作品，不改原来的。
 * 页面上的「让 AI 做」和以后接进来的 agent 走同一套规则：
 * - 待实现：AI 的待做。新作品，或者你反馈过、等 AI 继续的作品
 * - 进行中：AI 一步一步往下走
 * - 走到要你动手的步骤：改成等你处理，把要你做的事写好
 * - 你提交反馈：回到待实现最前面，等 AI 继续；AI 接手时先读反馈，把你那一步记为完成
 * - 走完最后一步：已完成。能自动发布的直接拿到链接；要你投递的，从你的反馈里取链接归档
 */

export type StepState = "done" | "running" | "waiting" | "pending"

export function workflowOf(work: Work) {
  return workflowById(work.workflowId)
}

export function platformOf(work: Work) {
  return PLATFORMS[accountById(work.accountId).platform]
}

/** 第 index 步现在是什么状态 */
export function stepState(work: Work, index: number): StepState {
  if (work.status === "done" || index < work.step) return "done"
  if (index > work.step) return "pending"
  if (work.status === "doing") return "running"
  if (work.status === "waiting") return "waiting"
  return "pending"
}

/** 当前这一步（已完成时没有） */
export function currentStep(work: Work) {
  return work.status === "done" ? undefined : workflowOf(work).steps[work.step]
}

/**
 * 等你处理时，卡片和面板上那一句「要你做什么」：当前步骤要你动手就用步骤名（你去知乎投递）；
 * 你手动挪过来的、当前步骤其实是 AI 的，就写「你来看一下」，不把 AI 的步骤说成你的事。
 */
export function waitingLabel(work: Work): string {
  const step = currentStep(work)
  return step?.kind === "manual" ? step.name : "你来看一下"
}

/** 「第 2/7 步 · AI 改写」；已完成时「7/7 步」 */
export function progressText(work: Work): string {
  const steps = workflowOf(work).steps
  if (work.status === "done") return `${steps.length}/${steps.length} 步`
  const step = steps[work.step]
  return `第 ${work.step + 1}/${steps.length} 步 · ${step?.name ?? ""}`
}

/** 从一段文字里取第一个网址 */
export function extractUrl(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s，。、；）)]+/)?.[0]
}

/** 任务文件夹里现在有哪些文件 */
export function taskFiles(work: Work): string[] {
  const steps = workflowOf(work).steps
  const files = ["作品.md", "状态.json"]
  const finished = work.status === "done" ? steps.length : work.step
  for (const step of steps.slice(0, finished)) files.push(...(step.produces ?? []))
  if (work.status === "waiting") files.push("要你做的事.md")
  if (work.feedback) files.push("你的反馈.md")
  files.push("记录.log")
  return files
}

/** 手动挪到「等你处理」、或者当前步骤没写要你做什么时，给的话 */
export const GENERIC_ASK = "你把它挪到了这里。看完在下面写反馈，AI 会照着接着做。"

function log(work: Work, at: IsoTime, text: string): Work {
  return { ...work, updatedAt: at, log: [...work.log, { at, text }] }
}

function askOf(work: Work, index: number): string {
  const step = workflowOf(work).steps[index]
  return (step?.ask ?? GENERIC_ASK).replaceAll("{folder}", taskFolder(work.id))
}

/**
 * AI 往前走一步。
 * - 待实现：当前步骤要你动手、你又反馈过 → 这一步记为完成，接着往下；要你动手但没反馈 → 改成等你处理；其余 → 开始做
 * - 进行中：当前这一步做完，进到下一步；下一步要你动手就停在等你处理
 * - 等你处理、已完成：不动
 */
export function advance(work: Work, at: IsoTime): Work {
  if (work.status === "waiting" || work.status === "done") return work
  const step = workflowOf(work).steps[work.step]

  if (work.status === "todo") {
    if (step?.kind === "manual") {
      if (work.feedback) return finishStep(log({ ...work, status: "doing" }, at, "读了你的反馈，接着做"), at)
      return log({ ...work, status: "waiting", ask: askOf(work, work.step) }, at, `等你：${step.name}`)
    }
    return log({ ...work, status: "doing" }, at, `AI 开始做：${step?.name ?? ""}`)
  }

  return finishStep(work, at)
}

function finishStep(work: Work, at: IsoTime): Work {
  const steps = workflowOf(work).steps
  const step = steps[work.step]
  const next = log({ ...work, step: work.step + 1 }, at, `完成：${step?.name ?? ""}`)
  if (next.step >= steps.length) return complete(next, at)
  const upcoming = steps[next.step]
  if (upcoming.kind === "manual") {
    return log({ ...next, status: "waiting", ask: askOf(next, next.step), feedback: undefined }, at, `等你：${upcoming.name}`)
  }
  return { ...next, status: "doing", ask: undefined }
}

function complete(work: Work, at: IsoTime): Work {
  const workflow = workflowOf(work)
  const url =
    work.url ??
    (workflow.autoPublish && platformOf(work).id === "blog"
      ? `https://blog.chaosyn.com/posts/${work.id}/`
      : extractUrl(work.feedback ?? ""))
  const done: Work = {
    ...work,
    status: "done",
    step: workflow.steps.length,
    ask: undefined,
    publishedAt: work.publishedAt ?? dayOf(at),
    ...(url ? { url } : {}),
  }
  return log(done, at, url ? `已发布，链接已归档：${url}` : "已完成，还没有链接")
}

/** 你在等你处理的作品上提交反馈：回到待实现最前面（order 取 topOrder），等 AI 继续 */
export function submitFeedback(work: Work, text: string, at: IsoTime, topOrder: number): Work {
  const feedback = text.trim()
  if (work.status !== "waiting" || !feedback) return work
  return log({ ...work, status: "todo", feedback, ask: undefined, order: topOrder }, at, `你的反馈：${feedback}`)
}

const STATUS_TEXT: Record<WorkStatus, string> = { todo: "待实现", doing: "进行中", waiting: "等你处理", done: "已完成" }

/**
 * 手动把作品挪到别的列（拖动卡片）。已完成的不能再挪出来。
 * - 挪到待实现：排在 order 指定的位置
 * - 挪到等你处理：要你做的事取当前步骤的，没有就用通用的一句
 * - 挪到已完成：当作你自己做完了，步骤记满，链接从反馈里取
 * 挪到进行中不走这里，走「让 AI 做」。
 */
export function moveTo(work: Work, status: Exclude<WorkStatus, "doing">, at: IsoTime, order: number): Work {
  if (work.status === status || work.status === "done") return work
  const moved = log({ ...work, status, order }, at, `你把它挪到了「${STATUS_TEXT[status]}」`)
  if (status === "done") return complete(moved, at)
  if (status === "waiting") {
    const step = currentStep(work)
    return { ...moved, ask: step?.kind === "manual" ? askOf(work, work.step) : GENERIC_ASK }
  }
  return { ...moved, ask: undefined }
}

/** AI 挑下一个：待实现里排最前的、工作流不用另外配置的 */
export function pickNext(works: Work[]): Work | undefined {
  return works
    .filter((work) => work.status === "todo" && workflowOf(work).status === "ready")
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))[0]
}

/** 转作品的来源：一条灵感、一个已有作品，或者直接新建 */
export type ConvertSource = { kind: "idea"; idea: Idea } | { kind: "work"; work: Work } | { kind: "new"; title: string }

/** 某个账号转过去会用哪个工作流 */
export function workflowForConvert(source: ConvertSource, accountId: string) {
  const platform = accountById(accountId).platform
  const workSource: WorkSource =
    source.kind === "idea"
      ? { kind: "idea", ideaId: source.idea.id }
      : source.kind === "work"
        ? { kind: "work", workId: source.work.id }
        : { kind: "none" }
  const sourcePlatform = source.kind === "work" ? accountById(source.work.accountId).platform : undefined
  return { workSource, workflow: pickWorkflow(platform, workSource, sourcePlatform) }
}

/** 转作品时「要求」一栏的默认内容 */
export function defaultBrief(source: ConvertSource): string {
  if (source.kind === "idea") return source.idea.detail
  if (source.kind === "work") return "照这个平台的写法改写，文末附原文链接。"
  return ""
}

/**
 * 转作品：选几个账号就生成几个作品，一个作品只对应一个平台。
 * 工作流按「平台 + 来源」自动配；ids 由调用方给（每个账号一个），新作品排在待实现最后（从 firstOrder 往后排）。
 */
export function convert(
  source: ConvertSource,
  accountIds: string[],
  brief: string,
  at: IsoTime,
  ids: string[],
  firstOrder: number,
): Work[] {
  return accountIds.map((accountId, index) => {
    const { workSource, workflow } = workflowForConvert(source, accountId)
    const title = source.kind === "idea" ? source.idea.text : source.kind === "work" ? source.work.title : source.title.trim()
    const fromText = source.kind === "idea" ? "由灵感转来" : source.kind === "work" ? `由《${source.work.title}》转来` : "直接新建"
    return {
      id: ids[index],
      title,
      accountId,
      status: "todo",
      brief: brief.trim(),
      source: workSource,
      workflowId: workflow.id,
      step: 0,
      order: firstOrder + index,
      createdAt: at,
      updatedAt: at,
      tags: [],
      log: [{ at, text: `创建，${fromText}，用「${workflow.name}」工作流` }],
    }
  })
}

const KIND_TEXT: Record<StepKind, string> = { ai: "AI", code: "自动", manual: "你来" }

export interface ContextSource {
  title: string
  url?: string
  localPath?: string
}

/**
 * 复制给 AI 的任务说明：任何 agent 拿到这段就知道要干什么、做到哪了、东西在哪。
 * 最后附上整份账号档案（profile 传页面上改过的；不传用初始的），agent 不用另外去找就知道这个号是干什么的。
 */
export function taskContext(work: Work, source?: ContextSource, profile?: string): string {
  const account = accountById(work.accountId)
  const workflow = workflowOf(work)
  const lines = [
    `# 作品 ${work.id}：${work.title}`,
    "",
    `- 平台：${PLATFORMS[account.platform].name} · ${account.name}`,
    `- 状态：${STATUS_TEXT[work.status]}（${progressText(work)}）`,
    `- 工作流：${workflow.name}`,
    `- 任务文件夹：${taskFolder(work.id)}`,
  ]
  if (source) {
    const where = [source.url, source.localPath ? `本地 ${source.localPath}` : ""].filter(Boolean).join("，")
    lines.push(`- 来源：《${source.title}》${where ? `（${where}）` : ""}`)
  }
  if (work.question) lines.push(`- 挂的问题：${work.question}`)
  lines.push("", "## 要求", "", work.brief || "（没有写）", "", "## 步骤", "")
  workflow.steps.forEach((step, index) => {
    const state = stepState(work, index)
    const mark = state === "done" ? "[x]" : state === "pending" ? "[ ]" : "[>]"
    lines.push(`${mark} ${index + 1}. ${step.name}（${KIND_TEXT[step.kind]}）`)
  })
  if (work.ask) lines.push("", "## 等作者做的事", "", work.ask)
  if (work.feedback) lines.push("", "## 作者的反馈", "", work.feedback)
  const text = (profile ?? account.profile).trim()
  lines.push("", `## 账号档案（${profilePath(account.id)}）`, "", text || "（还没写，写之前先问作者这个号写给谁、怎么写）")
  return lines.join("\n")
}
