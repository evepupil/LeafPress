import { describe, expect, it } from "vitest"

import { DEMO_NOW } from "@/data/clock"
import { RUNS } from "@/data/tools"
import type { StepState, ToolRun } from "@/data/types"
import { backfillRun, confirmRun, retryRun } from "./run-list-actions"

function runOf(id: string): ToolRun {
  const run = RUNS.find((item) => item.id === id)
  if (!run) throw new Error(`没有这条运行：${id}`)
  return run
}

function states(run: ToolRun): StepState[] {
  return run.steps.map((step) => step.state)
}

describe("回填知乎链接", () => {
  it("等的那一步和整次运行都变成完成，记下已回填和完成时间", () => {
    const after = backfillRun(runOf("run-01"), DEMO_NOW)
    expect(after.state).toBe("done")
    expect(after.finishedAt).toBe(DEMO_NOW)
    expect(after.waitingFor).toBeUndefined()
    expect(after.actionLabel).toBeUndefined()
    expect(states(after).every((state) => state === "done")).toBe(true)
    expect(after.steps[5]).toMatchObject({ name: "你发布并回填链接", state: "done", note: "已回填", at: DEMO_NOW })
  })

  it("只改拷贝，传进来的那条运行不变", () => {
    const before = runOf("run-01")
    backfillRun(before, DEMO_NOW)
    expect(before.state).toBe("waiting")
    expect(before.waitingFor).toBe("发布后回填知乎链接")
    expect(before.steps[5].state).toBe("waiting")
    expect(before.finishedAt).toBeUndefined()
  })
})

describe("确认", () => {
  it("字幕校对完了：校对那一步完成，下一步开始跑，整次运行回到运行中", () => {
    const after = confirmRun(runOf("run-02"), DEMO_NOW)
    expect(after.state).toBe("running")
    expect(after.waitingFor).toBeUndefined()
    expect(after.finishedAt).toBeUndefined()
    expect(states(after)).toEqual(["done", "done", "done", "done", "running", "pending", "pending"])
    expect(after.steps[3]).toMatchObject({ name: "你校对字幕", note: "已确认", at: DEMO_NOW })
  })

  it("确认大纲：同样的处理", () => {
    const after = confirmRun(runOf("run-05"), DEMO_NOW)
    expect(after.state).toBe("running")
    expect(states(after)).toEqual(["done", "done", "running", "pending", "pending"])
  })

  it("确认以后，正在跑的步骤始终只有一步", () => {
    for (const id of ["run-02", "run-05"]) {
      const running = confirmRun(runOf(id), DEMO_NOW).steps.filter((step) => step.state === "running")
      expect(running).toHaveLength(1)
    }
  })

  it("等的是最后一步时没有下一步可跑，整次运行直接结束", () => {
    const after = confirmRun(runOf("run-01"), DEMO_NOW)
    expect(after.state).toBe("done")
    expect(after.finishedAt).toBe(DEMO_NOW)
    expect(states(after).every((state) => state === "done")).toBe(true)
  })

  it("只改拷贝，传进来的那条运行不变", () => {
    const before = runOf("run-02")
    confirmRun(before, DEMO_NOW)
    expect(before.state).toBe("waiting")
    expect(before.steps[3].state).toBe("waiting")
    expect(before.steps[4].state).toBe("pending")
  })
})

describe("前提不成立时什么也不做", () => {
  it("没有在等人的步骤：回填和确认原样返回", () => {
    const running = runOf("run-09")
    expect(backfillRun(running, DEMO_NOW)).toBe(running)
    expect(confirmRun(running, DEMO_NOW)).toBe(running)
  })

  it("没有失败的步骤：重试原样返回", () => {
    const waiting = runOf("run-01")
    expect(retryRun(waiting)).toBe(waiting)
    const done = runOf("run-04")
    expect(retryRun(done)).toBe(done)
  })
})

describe("重试", () => {
  it("失败的那一步重新跑，整次运行回到运行中，失败原因和结束时间清掉", () => {
    const after = retryRun(runOf("run-03"))
    expect(after.state).toBe("running")
    expect(after.error).toBeUndefined()
    expect(after.finishedAt).toBeUndefined()
    expect(states(after)).toEqual(["done", "running", "done", "done"])
    // 重跑的那一步不再带着上一次的失败说明和时间
    expect(after.steps[1]).toEqual({ name: "博客统计", kind: "code", state: "running" })
    // 其余步骤原样保留
    expect(after.steps[0]).toEqual(runOf("run-03").steps[0])
  })

  it("第一步就失败的运行也能重试", () => {
    const after = retryRun(runOf("run-10"))
    expect(after.state).toBe("running")
    expect(states(after)).toEqual(["running", "pending", "pending", "pending"])
  })

  it("只改拷贝，传进来的那条运行不变", () => {
    const before = runOf("run-03")
    retryRun(before)
    expect(before.state).toBe("failed")
    expect(before.error).toBe("博客统计接口返回 401，其余数据已入库。")
    expect(before.steps[1].state).toBe("failed")
  })
})
