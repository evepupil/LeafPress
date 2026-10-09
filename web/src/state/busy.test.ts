import { describe, expect, it, vi } from "vitest"

import { isBusy, runBusy } from "./busy"

/** 手动控制什么时候结束的任务，用来观察「正在跑」这段时间的状态 */
function pendingTask<T>() {
  let finish!: (value: T) => void
  let fail!: (error: Error) => void
  const task = vi.fn(
    () =>
      new Promise<T>((resolve, reject) => {
        finish = resolve
        fail = reject
      }),
  )
  return { task, finish: (value: T) => finish(value), fail: (error: Error) => fail(error) }
}

describe("长请求的忙标记", () => {
  it("任务跑的时候这个键是忙的，结束后放开并返回任务的结果", async () => {
    const { task, finish } = pendingTask<string>()
    const running = runBusy("import:blog-1", task)
    expect(isBusy("import:blog-1")).toBe(true)
    finish("入库了")
    await expect(running).resolves.toBe("入库了")
    expect(isBusy("import:blog-1")).toBe(false)
  })

  it("同一个键正在跑时不再开第二个任务，直接返回 undefined", async () => {
    const first = pendingTask<string>()
    const second = vi.fn(() => Promise.resolve("不该被调用"))
    const running = runBusy("pull", first.task)
    await expect(runBusy("pull", second)).resolves.toBeUndefined()
    expect(second).not.toHaveBeenCalled()
    first.finish("ok")
    await running
    expect(first.task).toHaveBeenCalledTimes(1)
  })

  it("任务失败时错误照常往外抛，键也会放开", async () => {
    const { task, fail } = pendingTask<string>()
    const running = runBusy("pull", task)
    fail(new Error("统计接口返回 401"))
    await expect(running).rejects.toThrow("统计接口返回 401")
    expect(isBusy("pull")).toBe(false)
  })

  it("不同的键互不影响", async () => {
    const pull = pendingTask<string>()
    const importing = pendingTask<string>()
    const pulling = runBusy("pull", pull.task)
    const imported = runBusy("import:blog-1", importing.task)
    expect(isBusy("pull")).toBe(true)
    expect(isBusy("import:blog-1")).toBe(true)
    expect(isBusy("import:blog-2")).toBe(false)
    importing.finish("done")
    await imported
    expect(isBusy("import:blog-1")).toBe(false)
    expect(isBusy("pull")).toBe(true)
    pull.finish("done")
    await pulling
    expect(isBusy("pull")).toBe(false)
  })

  it("放开之后可以再跑一次", async () => {
    await runBusy("pull", () => Promise.resolve(1))
    await expect(runBusy("pull", () => Promise.resolve(2))).resolves.toBe(2)
  })
})
