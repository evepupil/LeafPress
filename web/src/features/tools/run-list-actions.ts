import type { IsoTime, RunStep, ToolRun } from "@/data/types"

/**
 * 抽屉里的三个动作：回填链接、确认、重试。
 * 都是纯函数：收一条运行，返回改好的新运行，不动传进来的那条；
 * 时间由调用方给，这里不取当前时间。
 * 前提不成立（没有在等人的步骤、没有失败的步骤）时什么也不做，原样返回。
 */

/** 正在等人的那一步（同一时刻一次运行只会有一步在等），没有返回 -1 */
function waitingIndex(run: ToolRun): number {
  return run.steps.findIndex((step) => step.state === "waiting")
}

/** 不用再等人了：去掉「等你做什么」和按钮文字 */
function stopWaiting(run: ToolRun): ToolRun {
  return { ...run, waitingFor: undefined, actionLabel: undefined }
}

/** 回填知乎链接：等的那一步做完，整次运行结束 */
export function backfillRun(run: ToolRun, at: IsoTime): ToolRun {
  const index = waitingIndex(run)
  if (index < 0) return run
  return {
    ...stopWaiting(run),
    state: "done",
    finishedAt: at,
    steps: run.steps.map((step, i): RunStep => (i === index ? { ...step, state: "done", note: "已回填", at } : step)),
  }
}

/**
 * 作者确认（字幕校对完了、大纲确认）：等的那一步做完，下一步开始跑，运行回到运行中。
 * 如果等的就是最后一步，没有下一步可跑，整次运行直接结束。
 */
export function confirmRun(run: ToolRun, at: IsoTime): ToolRun {
  const index = waitingIndex(run)
  if (index < 0) return run
  const hasNext = index + 1 < run.steps.length
  const steps = run.steps.map((step, i): RunStep => {
    if (i === index) return { ...step, state: "done", note: "已确认", at }
    if (hasNext && i === index + 1) return { ...step, state: "running" }
    return step
  })
  const next = stopWaiting(run)
  return hasNext ? { ...next, state: "running", steps } : { ...next, state: "done", finishedAt: at, steps }
}

/** 重试：失败的那一步重新跑，整次运行回到运行中，上一次的失败信息清掉 */
export function retryRun(run: ToolRun): ToolRun {
  const index = run.steps.findIndex((step) => step.state === "failed")
  if (index < 0) return run
  return {
    ...run,
    state: "running",
    error: undefined,
    finishedAt: undefined,
    steps: run.steps.map((step, i): RunStep => (i === index ? { name: step.name, kind: step.kind, state: "running" } : step)),
  }
}
