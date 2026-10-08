import { describe, expect, it } from "vitest"

import type { Work, WorkflowDef, WorkLease } from "../types/index.ts"
import { GENERAL_WRITE } from "../catalog/index.ts"
import {
  GENERIC_ASK,
  applyCodeResult,
  backToStep,
  completeAiStep,
  currentStep,
  extractUrl,
  moveWork,
  progressText,
  releaseWork,
  startWork,
  stepState,
  submitFeedback,
  updateWork,
  waitingLabel,
  type WorkResult,
} from "./engine.ts"

const at = "2026-10-08T09:30:00+08:00"
const nextAt = "2026-10-08T09:45:00+08:00"
const vars = { folder: "C:/tasks/w-1", platform: "知乎", account: "一叶" }
const lease: WorkLease = { since: at, expiresAt: "2026-10-08T10:00:00+08:00" }
const workflow: WorkflowDef = {
  id: "test-flow",
  name: "测试工作流",
  platform: "any",
  from: "any",
  summary: "test",
  say: "test",
  requires: [],
  steps: [
    { id: "draft", name: "写稿", kind: "ai", instructions: "为{platform}的{account}写到{folder}/稿子.md", produces: ["稿子.md"] },
    { id: "publish", name: "你去发布", kind: "manual", ask: "去{platform}发布给{account}，稿子在{folder}/稿子.md" },
    { id: "archive", name: "归档链接", kind: "code" },
  ],
}
const alternate: WorkflowDef = { ...workflow, id: "alternate", name: "另一个工作流" }

function makeWork(overrides: Partial<Work> = {}): Work {
  return {
    id: "w-1",
    title: "测试作品",
    accountId: "zhihu-1",
    status: "todo",
    brief: "写清楚",
    source: { kind: "none" },
    workflowId: workflow.id,
    step: 0,
    feedbackHistory: [],
    order: 1,
    createdAt: at,
    updatedAt: at,
    tags: [],
    log: [],
    ...overrides,
  }
}

function value(result: WorkResult): Work {
  if (!result.ok) throw new Error(result.reason)
  return result.work
}

function conflict(result: WorkResult, reason?: string): void {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.code).toBe("STATE_CONFLICT")
  expect(result.reason).toMatch(/[\u3400-\u9fff]/)
  if (reason) expect(result.reason).toBe(reason)
}

describe("作品状态流转", () => {
  it("待实现 → 接手 → AI 完成 → 反馈 → 接手 → 代码归档", () => {
    const original = makeWork()
    const started = value(startWork(original, workflow, { at, lease, vars }))
    expect(started).toMatchObject({ status: "doing", step: 0, lease })
    expect(started.log).toEqual([{ at, text: "agent 接手：写稿" }])
    expect(original.status).toBe("todo")

    const waiting = value(completeAiStep(started, workflow, { at: nextAt, vars }))
    expect(waiting).toMatchObject({ status: "waiting", step: 1, ask: "去知乎发布给一叶，稿子在C:/tasks/w-1/稿子.md" })
    expect(waiting.lease).toBeUndefined()
    expect(waiting.log.slice(-2).map((entry) => entry.text)).toEqual(["完成：写稿", "等你：你去发布"])

    const feedback = value(submitFeedback(waiting, workflow, "  发布了 https://zhuanlan.zhihu.com/p/1。  ", { at, order: -2 }))
    expect(feedback).toMatchObject({ status: "todo", order: -2, feedback: "发布了 https://zhuanlan.zhihu.com/p/1。", ask: undefined })
    expect(feedback.feedbackHistory).toEqual([{ at, step: 1, stepName: "你去发布", text: "发布了 https://zhuanlan.zhihu.com/p/1。" }])

    const resumed = value(startWork(feedback, workflow, { at: nextAt, lease, vars }))
    expect(resumed).toMatchObject({ status: "doing", step: 2, lease, feedback: feedback.feedback })
    expect(resumed.log.slice(-2).map((entry) => entry.text)).toEqual(["读了你的反馈，接着做", "完成：你去发布"])

    const done = value(applyCodeResult(resumed, workflow, { kind: "done", url: "https://zhuanlan.zhihu.com/p/1" }, { at: nextAt, vars }))
    expect(done).toMatchObject({ status: "done", step: 3, url: "https://zhuanlan.zhihu.com/p/1", publishedAt: "2026-10-08" })
    expect(done.lease).toBeUndefined()
    expect(done.log.slice(-2).map((entry) => entry.text)).toEqual(["完成：归档链接", "已发布，链接已归档：https://zhuanlan.zhihu.com/p/1"])
    expect(progressText(done, workflow)).toBe("3/3 步")
  })

  it("GENERAL_WRITE 从待实现完整流转到代码归档，代码链接覆盖反馈链接", () => {
    const original = makeWork({ workflowId: GENERAL_WRITE.id })
    const started = value(startWork(original, GENERAL_WRITE, { at, lease, vars }))
    const waiting = value(completeAiStep(started, GENERAL_WRITE, { at: nextAt, vars }))
    expect(waiting).toMatchObject({ status: "waiting", step: 1 })

    const feedbackUrl = "https://feedback.example.com/post"
    const submitted = value(submitFeedback(waiting, GENERAL_WRITE, `发布链接 ${feedbackUrl}`, { at, order: 0 }))
    const resumed = value(startWork(submitted, GENERAL_WRITE, { at: nextAt, lease, vars }))
    expect(resumed).toMatchObject({ status: "doing", step: 2, lease })

    const codeUrl = "https://code.example.com/archive"
    const done = value(applyCodeResult(resumed, GENERAL_WRITE, { kind: "done", url: codeUrl }, { at, vars }))
    expect(done).toMatchObject({ status: "done", step: 3, url: codeUrl })
    expect(done.url).not.toBe(feedbackUrl)
  })

  it("手动步骤无反馈时 toWaiting，ask、租约、错误和旧反馈均按规则处理", () => {
    const work = makeWork({ step: 1, lease, error: "旧错误" })
    const waiting = value(startWork(work, workflow, { at: nextAt, lease, vars }))
    expect(waiting).toMatchObject({ status: "waiting", step: 1, ask: "去知乎发布给一叶，稿子在C:/tasks/w-1/稿子.md" })
    expect(waiting.lease).toBeUndefined()
    expect(waiting.error).toBeUndefined()
    expect(waiting.feedback).toBeUndefined()
    expect(waiting.log.at(-1)?.text).toBe("等你：你去发布")
  })

  it("代码步骤 ask 后反馈仍留在当前代码步骤，失败留错，成功推进时清错", () => {
    const code = makeWork({ status: "doing", step: 2, lease, feedback: "should be cleared when asking" })
    const asked = value(applyCodeResult(code, workflow, { kind: "ask", ask: "请补链接", note: "没有找到链接" }, { at, vars }))
    expect(asked).toMatchObject({ status: "waiting", step: 2, ask: "请补链接", feedback: undefined })
    expect(asked.log.at(-1)?.text).toBe("等你：归档链接：没有找到链接")

    const replied = value(submitFeedback(asked, workflow, "链接 https://example.com/post", { at: nextAt, order: 0 }))
    const resumed = value(startWork(replied, workflow, { at, lease, vars }))
    expect(resumed).toMatchObject({ status: "doing", step: 2, feedback: "链接 https://example.com/post", lease })

    const failed = value(applyCodeResult(resumed, workflow, { kind: "fail", error: "记录库暂不可用" }, { at: nextAt, vars }))
    expect(failed).toMatchObject({ status: "doing", step: 2, error: "记录库暂不可用" })
    expect(failed.log.at(-1)?.text).toBe("出错：归档链接：记录库暂不可用")
    const done = value(applyCodeResult(failed, workflow, { kind: "done", publishedAt: "2026-10-07", note: "记录成功" }, { at, vars }))
    expect(done.status).toBe("done")
    expect(done.error).toBeUndefined()
    expect(done.url).toBe("https://example.com/post")
    expect(done.publishedAt).toBe("2026-10-07")
    expect(done.log.at(-2)?.text).toBe("完成：归档链接：记录成功")
  })

  it("退回 AI 保留反馈，退回手动步骤清反馈并要求作者重新处理", () => {
    const doing = makeWork({ status: "doing", step: 2, feedback: "要保留的意见", lease })
    const ai = value(backToStep(doing, workflow, 0, { at: nextAt, vars }))
    expect(ai).toMatchObject({ status: "doing", step: 0, feedback: "要保留的意见", lease })
    expect(ai.log.at(-1)?.text).toBe("退回到第 1 步：写稿")

    const manual = value(backToStep(doing, workflow, 1, { at: nextAt, vars }))
    expect(manual).toMatchObject({ status: "waiting", step: 1, ask: "去知乎发布给一叶，稿子在C:/tasks/w-1/稿子.md" })
    expect(manual.feedback).toBeUndefined()
    expect(manual.lease).toBeUndefined()
    expect(backToStep(doing, workflow, 2, { at, vars })).toMatchObject({ ok: false, code: "STATE_CONFLICT" })
  })

  it("退回到手动步骤后再接手不会跳过下一步，并清除旧 error", () => {
    const doing = makeWork({ status: "doing", step: 2, feedback: "旧反馈", error: "旧错误", lease })
    const backToAi = value(backToStep(doing, workflow, 0, { at: nextAt, vars }))
    expect(backToAi).toMatchObject({ status: "doing", step: 0, lease, error: undefined })

    const waiting = value(backToStep(doing, workflow, 1, { at: nextAt, vars }))
    expect(waiting).toMatchObject({ status: "waiting", step: 1, ask: "去知乎发布给一叶，稿子在C:/tasks/w-1/稿子.md", error: undefined })
    const submitted = value(submitFeedback(waiting, workflow, "已重新发布 https://feedback.example.com/revised", { at, order: 0 }))
    const resumed = value(startWork(submitted, workflow, { at: nextAt, lease, vars }))
    expect(resumed).toMatchObject({ status: "doing", step: 2, lease })
    expect(currentStep(resumed, workflow)?.kind).toBe("code")
    expect(resumed.log.slice(-2).map((entry) => entry.text)).toEqual(["读了你的反馈，接着做", "完成：你去发布"])
  })

  it("拖动到三列、交还、接管和记录原文", () => {
    const doing = makeWork({ status: "doing", step: 0, lease })
    const todo = value(moveWork(doing, workflow, "todo", { at: nextAt, order: 7, vars }))
    expect(todo).toMatchObject({ status: "todo", order: 7, ask: undefined, lease: undefined })
    expect(todo.log.at(-1)?.text).toBe("你把它挪到了「待实现」")

    const waitingAi = value(moveWork(makeWork(), workflow, "waiting", { at, order: 4, vars }))
    expect(waitingAi.ask).toBe(GENERIC_ASK)
    expect(waitingAi.log.at(-1)?.text).toBe("你把它挪到了「等你处理」")
    const waitingManual = value(moveWork(makeWork({ step: 1 }), workflow, "waiting", { at, order: 4, vars }))
    expect(waitingManual.ask).toBe("去知乎发布给一叶，稿子在C:/tasks/w-1/稿子.md")

    const completed = value(
      moveWork(makeWork({ status: "waiting", step: 1, feedback: "发了 https://example.com/a" }), workflow, "done", { at, order: 0, vars }),
    )
    expect(completed).toMatchObject({ status: "done", step: 3, url: "https://example.com/a", publishedAt: "2026-10-08" })
    const noLink = value(moveWork(makeWork({ status: "waiting", step: 1 }), workflow, "done", { at, order: 0, vars }))
    expect(noLink.publishedAt).toBe("2026-10-08")
    expect(noLink.log.at(-1)?.text).toBe("已完成，还没有链接")
    conflict(moveWork(completed, workflow, "todo", { at, order: 1, vars }), "已完成的作品不能挪出来")
    expect(value(moveWork(completed, workflow, "done", { at, order: 1, vars }))).toBe(completed)

    const released = value(releaseWork(doing, { at: nextAt, order: -1 }))
    expect(released).toMatchObject({ status: "todo", order: -1, lease: undefined })
    expect(released.log.at(-1)?.text).toBe("agent 交还，回到待实现")
    const takenOver = value(startWork(makeWork({ status: "doing" }), workflow, { at, lease, vars, takeover: true }))
    expect(takenOver.log.at(-1)?.text).toBe("agent 接管：写稿")
  })

  it("只有挪到待实现才改 order", () => {
    const waiting = value(moveWork(makeWork({ order: 6 }), workflow, "waiting", { at, order: 11, vars }))
    const done = value(moveWork(makeWork({ order: 6 }), workflow, "done", { at, order: 12, vars }))
    const todo = value(moveWork(makeWork({ status: "waiting", order: 6 }), workflow, "todo", { at, order: 13, vars }))
    expect(waiting.order).toBe(6)
    expect(done.order).toBe(6)
    expect(todo.order).toBe(13)
  })

  it("前提失败、空反馈、标题校验和工作流切换", () => {
    conflict(startWork(makeWork({ status: "waiting" }), workflow, { at, lease, vars }))
    conflict(completeAiStep(makeWork(), workflow, { at, vars }))
    conflict(completeAiStep(makeWork({ status: "doing", step: 2 }), workflow, { at, vars }), "这一步是自动步骤，用 leafpress work run")
    conflict(completeAiStep(makeWork({ status: "doing", step: 1 }), workflow, { at, vars }), "这一步要作者来做")
    conflict(applyCodeResult(makeWork({ status: "doing" }), workflow, { kind: "done" }, { at, vars }))
    conflict(releaseWork(makeWork(), { at, order: 1 }))
    conflict(submitFeedback(makeWork(), workflow, "text", { at, order: 1 }))

    const waiting = makeWork({ status: "waiting", step: 1 })
    expect(submitFeedback(waiting, workflow, "  \n ", { at, order: 1 })).toEqual({ ok: false, code: "INVALID", reason: "反馈不能是空的" })
    expect(updateWork(makeWork(), { title: "  " }, { at })).toEqual({ ok: false, code: "INVALID", reason: "标题不能为空" })

    const changed = value(
      updateWork(
        makeWork({ url: "https://old", question: "问题" }),
        { title: " 新标题 ", url: null, question: null, workflowId: alternate.id },
        { at, workflow: alternate },
      ),
    )
    expect(changed).toMatchObject({ title: "新标题", workflowId: "alternate", updatedAt: at })
    expect(changed.url).toBeUndefined()
    expect(changed.question).toBeUndefined()
    expect(changed.log.at(-1)?.text).toBe("换成「另一个工作流」工作流")
    conflict(
      updateWork(makeWork({ status: "doing" }), { workflowId: alternate.id }, { at, workflow: alternate }),
      "已经开始做了，不能换工作流",
    )
    expect(updateWork(makeWork(), { workflowId: alternate.id }, { at })).toMatchObject({ ok: false, code: "INVALID" })
  })

  it("AI 与代码步骤完成后继续运行的 AI/code 保留租约并清掉 error", () => {
    const secondAi: WorkflowDef = {
      ...workflow,
      steps: [workflow.steps[0]!, { ...workflow.steps[0]!, id: "draft-again", name: "再写一遍" }],
    }
    const aiResult = value(completeAiStep(makeWork({ status: "doing", step: 0, lease, error: "旧错误" }), secondAi, { at, vars }))
    expect(aiResult).toMatchObject({ status: "doing", step: 1, lease, error: undefined })

    const codeThenAi: WorkflowDef = {
      ...workflow,
      steps: [workflow.steps[2]!, { ...workflow.steps[0]!, id: "after-code", name: "代码后生成" }],
    }
    const codeResult = value(
      applyCodeResult(makeWork({ status: "doing", step: 0, lease, error: "旧错误" }), codeThenAi, { kind: "done" }, { at, vars }),
    )
    expect(codeResult).toMatchObject({ status: "doing", step: 1, lease, error: undefined })
  })

  it("接手、退回和应用代码结果的状态前提", () => {
    conflict(startWork(makeWork({ status: "doing" }), workflow, { at, lease, vars }))
    conflict(backToStep(makeWork({ status: "todo", step: 2 }), workflow, 1, { at, vars }))
    conflict(applyCodeResult(makeWork({ status: "todo", step: 2 }), workflow, { kind: "done" }, { at, vars }))
  })

  it("extractUrl 只取第一个 ASCII 链接并剥掉尾随标点", () => {
    const url = "https://example.com/p/1"
    for (const suffix of [".", ",", ";", ":", "!", "?", "'", '"', ")", "]", "！", "：", "」", "发布好了", "……》”"]) {
      expect(extractUrl(`${url}${suffix}`)).toBe(url)
    }
    expect(extractUrl("请看 https://example.com/p/1?q=a+b&x=%20，再看 https://example.com/p/2")).toBe("https://example.com/p/1?q=a+b&x=%20")
    expect(extractUrl("第一条 https://example.com/p/1, 第二条 https://example.com/p/2")).toBe(url)
  })

  it("查询步骤、等待标签、越界当前步骤和链接提取", () => {
    const waiting = makeWork({ status: "waiting", step: 1 })
    expect([stepState(waiting, 0), stepState(waiting, 1), stepState(waiting, 2)]).toEqual(["done", "waiting", "pending"])
    expect(currentStep(waiting, workflow)?.name).toBe("你去发布")
    expect(waitingLabel(waiting, workflow)).toBe("你去发布")
    expect(waitingLabel(makeWork({ status: "waiting" }), workflow)).toBe("你来看一下")
    expect(currentStep(makeWork({ status: "done", step: 3 }), workflow)).toBeUndefined()
    expect(extractUrl("发布了：https://example.com/a，谢谢")).toBe("https://example.com/a")
    expect(extractUrl("没有链接")).toBeUndefined()
  })
})
