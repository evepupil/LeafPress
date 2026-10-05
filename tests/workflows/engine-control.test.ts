/* eslint-disable @typescript-eslint/require-await -- Step fixtures use async outcomes to mirror the engine contract. */
import { describe, expect, it, vi } from "vitest";

import type { StepOutcome } from "../../src/workflows/types.js";
import { makeHarness, makeStep, makeWorkflow } from "./helpers.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("工作流控制与查询", () => {
  it("等待中和失败的运行可以取消，取消后不能恢复", async () => {
    const waitHarness = await makeHarness([
      makeWorkflow([
        makeStep(
          "manual",
          async () => ({
            type: "wait",
            wait: { kind: "manual", message: "等作者" },
          }),
          { kind: "manual" },
        ),
      ]),
    ]);
    const waiting = await waitHarness.engine.start("demo", {});
    expect(waitHarness.engine.cancel(waiting.runId).state).toBe("cancelled");
    await expect(
      waitHarness.engine.resume(waiting.runId),
    ).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
      message: "这次运行已经结束",
    });

    const failedHarness = await makeHarness([
      makeWorkflow([
        makeStep("fail", async () => ({ type: "fail", error: "失败" })),
      ]),
    ]);
    const failed = await failedHarness.engine.start("demo", {});
    expect(failed.state).toBe("failed");
    expect(failedHarness.engine.cancel(failed.runId).state).toBe("cancelled");
    expect(
      failedHarness.store.getRun(failed.runId)?.leaseOwner,
    ).toBeUndefined();
  });

  it("有效租约运行不能取消，过期运行 force 取消后原执行停止写记录", async () => {
    const active = deferred<void>();
    const finish = deferred<StepOutcome>();
    const activeHarness = await makeHarness([
      makeWorkflow([
        makeStep("long", async () => {
          active.resolve();
          return finish.promise;
        }),
      ]),
    ]);
    const activeRun = activeHarness.engine.start("demo", {});
    await active.promise;
    expect(() => activeHarness.engine.cancel("run-1")).toThrowError(
      "正在运行，不能取消；如果确定上次异常退出，等租约过期后加 --force",
    );
    expect(() =>
      activeHarness.engine.cancel("run-1", { force: true }),
    ).toThrowError(
      "正在运行，不能取消；如果确定上次异常退出，等租约过期后加 --force",
    );
    finish.resolve({ type: "done" });
    expect((await activeRun).state).toBe("completed");

    const expiredActive = deferred<void>();
    const expiredFinish = deferred<StepOutcome>();
    const expiredHarness = await makeHarness([
      makeWorkflow([
        makeStep("long", async () => {
          expiredActive.resolve();
          return expiredFinish.promise;
        }),
      ]),
    ]);
    const originalExecution = expiredHarness.engine.start("demo", {});
    await expiredActive.promise;
    const before = expiredHarness.store.getSteps("run-1")[0];
    const acquireSpy = vi.spyOn(expiredHarness.store, "acquireRun");
    expiredHarness.advance(1_001);
    expect(() => expiredHarness.engine.cancel("run-1")).toThrowError(
      "正在运行，不能取消；如果确定上次异常退出，等租约过期后加 --force",
    );
    expect(expiredHarness.engine.cancel("run-1", { force: true }).state).toBe(
      "cancelled",
    );
    expect(expiredHarness.ownerTokens).toEqual([
      "owner-1",
      "owner-2",
      "owner-3",
    ]);
    const acquireCalls = acquireSpy.mock.calls;
    expect(acquireCalls[acquireCalls.length - 1]?.[1].owner).toBe("owner-3");
    expiredFinish.resolve({ type: "done" });
    await expect(originalExecution).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
    });
    expect(expiredHarness.store.getSteps("run-1")[0]).toEqual(before);
  });

  it("已完成运行不可取消，并返回 show 详情和 list 筛选结果", async () => {
    const harness = await makeHarness([
      makeWorkflow([
        makeStep(
          "wait",
          async () => ({
            type: "wait",
            wait: { kind: "manual", message: "等待" },
          }),
          { kind: "manual" },
        ),
      ]),
    ]);
    const waiting = await harness.engine.start("demo", {});
    const detail = harness.engine.show(waiting.runId);
    expect(detail).toMatchObject({
      state: "waiting",
      currentStep: { id: "wait", title: "wait", kind: "manual" },
      wait: { message: "等待" },
    });
    expect(detail.steps).toHaveLength(1);
    expect(
      harness.engine.list({ states: ["waiting"] }).map((run) => run.id),
    ).toEqual([waiting.runId]);
    expect(harness.engine.list({ states: ["completed"] })).toEqual([]);
    expect(() => harness.engine.show("missing")).toThrowError(
      "找不到运行「missing」",
    );

    const completedHarness = await makeHarness([
      makeWorkflow([makeStep("done", async () => ({ type: "done" }))]),
    ]);
    const completed = await completedHarness.engine.start("demo", {});
    expect(() => completedHarness.engine.cancel(completed.runId)).toThrowError(
      "这次运行已经结束",
    );
    await expect(
      completedHarness.engine.resume(completed.runId),
    ).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
      message: "这次运行已经结束",
    });
  });
});
