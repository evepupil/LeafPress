import { dayOf } from "../dates/index.ts"
import type { UpdateWorkInput } from "../api/index.ts"
import type { CodeOutcome, FeedbackEntry, IsoTime, StepState, Work, WorkLease, WorkflowDef, WorkflowStep } from "../types/index.ts"
import { fillTemplate, type StepVars } from "../workflows/index.ts"

export type RuleFailure = { ok: false; code: "STATE_CONFLICT" | "INVALID"; reason: string }
export type WorkResult = { ok: true; work: Work } | RuleFailure

export const GENERIC_ASK = "你把它挪到了这里。看完在下面写反馈，agent 会照着接着做。"

function failure(code: RuleFailure["code"], reason: string): RuleFailure {
  return { ok: false, code, reason }
}

function record(work: Work, at: IsoTime, text: string): Work {
  return { ...work, updatedAt: at, log: [...work.log, { at, text }] }
}

function ok(work: Work): WorkResult {
  return { ok: true, work }
}

function toWaiting(work: Work, ask: string, at: IsoTime): Work {
  // 进入新一轮作者处理时，反馈已归入历史；不要让旧反馈混进下一次接手。
  return { ...work, status: "waiting", ask, lease: undefined, error: undefined, feedback: undefined, updatedAt: at }
}

function complete(work: Work, workflow: WorkflowDef, at: IsoTime): Work {
  const url = work.url ?? extractUrl(work.feedback ?? "")
  const done: Work = {
    ...work,
    status: "done",
    step: workflow.steps.length,
    ask: undefined,
    lease: undefined,
    error: undefined,
    publishedAt: work.publishedAt ?? dayOf(at),
    url,
  }
  return record(done, at, url ? `已发布，链接已归档：${url}` : "已完成，还没有链接")
}

/** 推进当前步骤，并按下一步类型选择继续、等待作者或完成。 */
function advance(work: Work, workflow: WorkflowDef, at: IsoTime, vars: StepVars, currentStepAlreadyRecorded = false): Work {
  const step = workflow.steps[work.step]
  const advanced = { ...work, step: work.step + 1, error: undefined }
  // CodeOutcome.done has already logged this step with its optional note.
  const completed = currentStepAlreadyRecorded ? { ...advanced, updatedAt: at } : record(advanced, at, `完成：${step?.name ?? ""}`)
  if (completed.step >= workflow.steps.length) return complete(completed, workflow, at)

  const nextStep = workflow.steps[completed.step]
  if (nextStep?.kind === "manual") {
    const waiting = toWaiting(completed, askFor({ ...completed, step: completed.step }, workflow, vars), at)
    return record(waiting, at, `等你：${nextStep.name}`)
  }
  return { ...completed, status: "doing", ask: undefined }
}

/** 当前步骤的状态。 */
export function stepState(work: Work, index: number): StepState {
  if (work.status === "done" || index < work.step) return "done"
  if (index > work.step) return "pending"
  if (work.status === "doing") return "running"
  if (work.status === "waiting") return "waiting"
  return "pending"
}

/** 当前步骤；作品已完成或步骤越界时返回 undefined。 */
export function currentStep(work: Work, workflow: WorkflowDef): WorkflowStep | undefined {
  if (work.status === "done") return undefined
  return workflow.steps[work.step]
}

/** 当前进度的中文说明。 */
export function progressText(work: Work, workflow: WorkflowDef): string {
  if (work.status === "done") return `${workflow.steps.length}/${workflow.steps.length} 步`
  const step = workflow.steps[work.step]
  return `第 ${work.step + 1}/${workflow.steps.length} 步 · ${step?.name ?? ""}`
}

/** 等待处理时展示的短标签。 */
export function waitingLabel(work: Work, workflow: WorkflowDef): string {
  const step = currentStep(work, workflow)
  return step?.kind === "manual" ? step.name : "你来看一下"
}

/** 当前步骤的 ask 已按任务变量填充；没有 ask 时使用通用提示。 */
export function askFor(work: Work, workflow: WorkflowDef, vars: StepVars): string {
  const ask = workflow.steps[work.step]?.ask || GENERIC_ASK
  return fillTemplate(ask, vars)
}

/** 取第一个 http(s) ASCII URL，并去掉末尾标点。 */
export function extractUrl(text: string): string | undefined {
  const url = text.match(/https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/)?.[0]
  return url?.replace(/[.,;:!?'")\]]+$/, "")
}

/** 接手待实现作品；接管时也接受进行中的作品。 */
export function startWork(
  work: Work,
  workflow: WorkflowDef,
  input: { at: IsoTime; lease: WorkLease; vars: StepVars; takeover?: boolean },
): WorkResult {
  if (work.status !== "todo" && !(work.status === "doing" && input.takeover)) {
    return failure("STATE_CONFLICT", "只有待实现的作品可以接手；进行中的作品需要明确接管")
  }

  const step = workflow.steps[work.step]
  if (step?.kind === "manual") {
    if (!work.feedback) {
      const waiting = toWaiting(work, askFor(work, workflow, input.vars), input.at)
      return ok(record(waiting, input.at, `等你：${step.name}`))
    }
    const read = record({ ...work, status: "doing" }, input.at, "读了你的反馈，接着做")
    const advanced = advance(read, workflow, input.at, input.vars)
    return ok(advanced.status === "doing" ? { ...advanced, lease: input.lease } : advanced)
  }

  const started: Work = { ...work, status: "doing", ask: undefined, lease: input.lease }
  const action = work.status === "doing" ? "agent 接管" : "agent 接手"
  return ok(record(started, input.at, `${action}：${step?.name ?? ""}`))
}

/** 完成当前 AI 步骤。 */
export function completeAiStep(work: Work, workflow: WorkflowDef, input: { at: IsoTime; vars: StepVars }): WorkResult {
  if (work.status !== "doing") return failure("STATE_CONFLICT", "只有进行中的作品可以完成步骤")
  const step = workflow.steps[work.step]
  if (step?.kind !== "ai") {
    const reason =
      step?.kind === "code"
        ? "这一步是自动步骤，用 leafpress work run"
        : step?.kind === "manual"
          ? "这一步要作者来做"
          : "没有可完成的当前步骤"
    return failure("STATE_CONFLICT", reason)
  }
  return ok(advance(work, workflow, input.at, input.vars))
}

/** 应用代码步骤执行结果。 */
export function applyCodeResult(
  work: Work,
  workflow: WorkflowDef,
  outcome: CodeOutcome,
  input: { at: IsoTime; vars: StepVars },
): WorkResult {
  if (work.status !== "doing") return failure("STATE_CONFLICT", "只有进行中的作品可以应用代码步骤结果")
  const step = workflow.steps[work.step]
  if (step?.kind !== "code") {
    const reason =
      step?.kind === "ai"
        ? "这一步是 AI 步骤，用 leafpress work step"
        : step?.kind === "manual"
          ? "这一步要作者来做"
          : "没有可应用结果的当前步骤"
    return failure("STATE_CONFLICT", reason)
  }

  if (outcome.kind === "ask") {
    const waiting = toWaiting(work, outcome.ask, input.at)
    return ok(record(waiting, input.at, `等你：${step.name}${outcome.note ? `：${outcome.note}` : ""}`))
  }
  if (outcome.kind === "fail") {
    return ok(record({ ...work, status: "doing", error: outcome.error }, input.at, `出错：${step.name}：${outcome.error}`))
  }

  const withOutcome: Work = {
    ...work,
    ...(outcome.url === undefined ? {} : { url: outcome.url }),
    ...(outcome.publishedAt === undefined ? {} : { publishedAt: outcome.publishedAt }),
    ...(outcome.localPath === undefined ? {} : { localPath: outcome.localPath }),
    ...(outcome.sourceRef === undefined ? {} : { sourceRef: outcome.sourceRef }),
  }
  const noted = record(withOutcome, input.at, `完成：${step.name}${outcome.note ? `：${outcome.note}` : ""}`)
  return ok(advance(noted, workflow, input.at, input.vars, true))
}

/** 将进行中的作品退回到更早一步。 */
export function backToStep(work: Work, workflow: WorkflowDef, target: number, input: { at: IsoTime; vars: StepVars }): WorkResult {
  if (work.status !== "doing") return failure("STATE_CONFLICT", "只有进行中的作品可以退回")
  if (!Number.isInteger(target) || target < 0 || target >= work.step) return failure("STATE_CONFLICT", "只能退回到当前步骤之前")
  const step = workflow.steps[target]
  if (!step) return failure("STATE_CONFLICT", "退回目标步骤不存在")

  const moved: Work = { ...work, step: target, error: undefined }
  const next =
    step.kind === "manual"
      ? toWaiting(moved, askFor(moved, workflow, input.vars), input.at)
      : { ...moved, status: "doing" as const, ask: undefined }
  return ok(record(next, input.at, `退回到第 ${target + 1} 步：${step.name}`))
}

/** agent 交还作品，回到待实现队列。 */
export function releaseWork(work: Work, input: { at: IsoTime; order: number }): WorkResult {
  if (work.status !== "doing") return failure("STATE_CONFLICT", "只有进行中的作品可以交还")
  return ok(record({ ...work, status: "todo", order: input.order, lease: undefined }, input.at, "agent 交还，回到待实现"))
}

/** 作者提交反馈后，作品回到待实现队列，并追加一条反馈历史。 */
export function submitFeedback(work: Work, workflow: WorkflowDef, text: string, input: { at: IsoTime; order: number }): WorkResult {
  if (work.status !== "waiting") return failure("STATE_CONFLICT", "只有等你处理的作品可以提交反馈")
  const feedback = text.trim()
  if (!feedback) return failure("INVALID", "反馈不能是空的")
  const stepName = workflow.steps[work.step]?.name ?? ""
  const entry: FeedbackEntry = { at: input.at, step: work.step, stepName, text: feedback }
  return ok(
    record(
      { ...work, status: "todo", order: input.order, feedback, feedbackHistory: [...work.feedbackHistory, entry], ask: undefined },
      input.at,
      `你的反馈：${feedback}`,
    ),
  )
}

/** 手动拖动作品到待实现、等你处理或已完成列。 */
export function moveWork(
  work: Work,
  workflow: WorkflowDef,
  status: "todo" | "waiting" | "done",
  input: { at: IsoTime; order: number; vars: StepVars },
): WorkResult {
  if (work.status === "done" && status !== "done") return failure("STATE_CONFLICT", "已完成的作品不能挪出来")
  if (work.status === status) return ok(work)

  const moved = record(
    { ...work, status, ...(status === "todo" ? { order: input.order } : {}), ...(work.status === "doing" ? { lease: undefined } : {}) },
    input.at,
    `你把它挪到了「${status === "todo" ? "待实现" : status === "waiting" ? "等你处理" : "已完成"}」`,
  )
  if (status === "todo") return ok({ ...moved, ask: undefined })
  if (status === "waiting") {
    const step = workflow.steps[work.step]
    const ask = step?.kind === "manual" ? askFor(work, workflow, input.vars) : GENERIC_ASK
    return ok(toWaiting(moved, ask, input.at))
  }
  return ok(complete(moved, workflow, input.at))
}

/** 更新作品字段；换工作流只允许尚未开始的作品。 */
export function updateWork(work: Work, patch: UpdateWorkInput, input: { at: IsoTime; workflow?: WorkflowDef }): WorkResult {
  if (patch.title !== undefined && !patch.title.trim()) return failure("INVALID", "标题不能为空")
  const changingWorkflow = patch.workflowId !== undefined && patch.workflowId !== work.workflowId
  if (changingWorkflow && (work.status !== "todo" || work.step !== 0)) {
    return failure("STATE_CONFLICT", "已经开始做了，不能换工作流")
  }
  if (changingWorkflow && !input.workflow) return failure("INVALID", "换工作流时必须提供新的工作流")
  if (changingWorkflow && input.workflow && input.workflow.id !== patch.workflowId) return failure("INVALID", "新的工作流编号不匹配")

  const next: Work = {
    ...work,
    ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
    ...(patch.brief === undefined ? {} : { brief: patch.brief }),
    ...(patch.url === undefined || patch.url === null ? {} : { url: patch.url }),
    ...(patch.question === undefined || patch.question === null ? {} : { question: patch.question }),
    updatedAt: input.at,
  }
  if (patch.url === null) delete next.url
  if (patch.question === null) delete next.question
  if (!changingWorkflow) return ok(next)
  const workflow = input.workflow
  if (!workflow) return failure("INVALID", "换工作流时必须提供新的工作流")
  return ok(record({ ...next, workflowId: workflow.id }, input.at, `换成「${workflow.name}」工作流`))
}
