/* eslint-disable @typescript-eslint/require-await -- Step fixtures use async outcomes to mirror the engine contract. */
import { describe, expect, it } from "vitest";

import type { StepOutcome } from "../../src/workflows/types.js";
import { makeHarness, makeStep, makeWorkflow } from "./helpers.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("工作流租约与并发", () => {
  it("运行中租约有效时拒绝恢复，过期后必须 force 才能接管", async () => {
    const workflow = makeWorkflow([
      makeStep(
        "wait",
        async (ctx) =>
          ctx.resume
            ? { type: "done" }
            : { type: "wait", wait: { kind: "manual", message: "等待" } },
        { kind: "manual" },
      ),
    ]);
    const harness = await makeHarness([workflow]);
    const waiting = await harness.engine.start("demo", {});
    const now = harness.now();
    const expires = new Date(now.getTime() + 5_000).toISOString();
    expect(
      harness.store.acquireRun(waiting.runId, {
        from: ["waiting"],
        owner: "remote-owner",
        leaseExpiresAt: expires,
        now: now.toISOString(),
        takeOverExpired: false,
      }),
    ).toBe(true);

    await expect(harness.engine.resume(waiting.runId)).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
      message: "正在别处运行",
    });
    await expect(
      harness.engine.resume(waiting.runId, undefined, { force: true }),
    ).rejects.toMatchObject({ message: "正在别处运行" });

    harness.advance(5_001);
    await expect(harness.engine.resume(waiting.runId)).rejects.toMatchObject({
      message: "上次似乎异常退出，确认后加 --force 接管",
    });
    expect(
      (
        await harness.engine.resume(
          waiting.runId,
          { approve: true },
          { force: true },
        )
      ).state,
    ).toBe("completed");
  });

  it("同一引擎每次 start 都生成独立令牌", async () => {
    const firstEntered = deferred<void>();
    const secondEntered = deferred<void>();
    const firstOutcome = deferred<StepOutcome>();
    const secondOutcome = deferred<StepOutcome>();
    let invocations = 0;
    const harness = await makeHarness([
      makeWorkflow([
        makeStep("wait", async () => {
          invocations += 1;
          if (invocations === 1) {
            firstEntered.resolve();
            return firstOutcome.promise;
          }
          secondEntered.resolve();
          return secondOutcome.promise;
        }),
      ]),
    ]);

    const first = harness.engine.start("demo", {});
    await firstEntered.promise;
    const second = harness.engine.start("demo", {});
    await secondEntered.promise;

    expect(harness.store.getRun("run-1")?.leaseOwner).toBe("owner-1");
    expect(harness.store.getRun("run-2")?.leaseOwner).toBe("owner-2");
    expect(harness.ownerTokens).toEqual(["owner-1", "owner-2"]);

    firstOutcome.resolve({
      type: "wait",
      wait: { kind: "manual", message: "等待一" },
    });
    secondOutcome.resolve({
      type: "wait",
      wait: { kind: "manual", message: "等待二" },
    });
    expect(
      (await Promise.all([first, second])).map((report) => report.state),
    ).toEqual(["waiting", "waiting"]);
  });

  it("resume 在首次 await 前用本次令牌取得执行权", async () => {
    const workflow = makeWorkflow([
      makeStep(
        "wait",
        async (ctx) =>
          ctx.resume
            ? { type: "done" }
            : { type: "wait", wait: { kind: "manual", message: "等待" } },
        { kind: "manual" },
      ),
    ]);
    const harness = await makeHarness([workflow]);
    const waiting = await harness.engine.start("demo", {});

    const pending = harness.engine.resume(waiting.runId);

    expect(harness.ownerTokens).toEqual(["owner-1", "owner-2"]);
    expect(harness.store.getRun(waiting.runId)).toMatchObject({
      state: "running",
      leaseOwner: "owner-2",
    });
    expect((await pending).state).toBe("completed");
  });

  it("inputFiles 中租约被其他令牌接管后抛冲突且不写步骤记录", async () => {
    const harnessRef: {
      current: Awaited<ReturnType<typeof makeHarness>> | undefined;
    } = { current: undefined };
    const workflow = makeWorkflow([
      makeStep("snapshot", async () => ({ type: "done" }), {
        inputFiles(ctx) {
          const harness = harnessRef.current;
          if (!harness) throw new Error("测试引擎尚未创建");
          harness.advance(1_001);
          const now = harness.now();
          expect(
            harness.store.acquireRun(ctx.runId, {
              from: [],
              owner: "replacement-owner",
              leaseExpiresAt: new Date(now.getTime() + 1_000).toISOString(),
              now: now.toISOString(),
              takeOverExpired: true,
            }),
          ).toBe(true);
          return [];
        },
      }),
    ]);
    const harness = await makeHarness([workflow], { leaseMs: 1_000 });
    harnessRef.current = harness;

    await expect(harness.engine.start("demo", {})).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
    });
    expect(harness.store.getRun("run-1")?.leaseOwner).toBe("replacement-owner");
    expect(harness.store.getSteps("run-1")[0]).toMatchObject({
      status: "pending",
      attempts: 0,
    });
  });

  it("同一引擎 force 接管时使用新令牌，旧执行续约失败", async () => {
    const firstEntered = deferred<void>();
    const secondEntered = deferred<void>();
    const firstOutcome = deferred<StepOutcome>();
    const secondOutcome = deferred<StepOutcome>();
    let invocations = 0;
    const harness = await makeHarness(
      [
        makeWorkflow([
          makeStep("long", async () => {
            invocations += 1;
            if (invocations === 1) {
              firstEntered.resolve();
              return firstOutcome.promise;
            }
            secondEntered.resolve();
            return secondOutcome.promise;
          }),
        ]),
      ],
      { leaseMs: 1_000 },
    );

    const original = harness.engine.start("demo", {});
    await firstEntered.promise;
    harness.advance(1_001);
    const takeover = harness.engine.resume("run-1", undefined, { force: true });
    await secondEntered.promise;
    expect(harness.store.getRun("run-1")?.leaseOwner).toBe("owner-2");

    const beforeStaleResume = harness.store.getSteps("run-1")[0];
    firstOutcome.resolve({ type: "done" });
    await expect(original).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
      message: "执行权已被别的进程接管，本进程停止",
    });
    expect(harness.store.getSteps("run-1")[0]).toEqual(beforeStaleResume);

    secondOutcome.resolve({
      type: "wait",
      wait: { kind: "manual", message: "等待" },
    });
    expect((await takeover).state).toBe("waiting");
    expect(harness.ownerTokens).toEqual(["owner-1", "owner-2"]);
  });

  it("同时恢复等待运行和过期运行时都只有一个调用成功", async () => {
    const workflow = makeWorkflow([
      makeStep(
        "wait",
        async (ctx) =>
          ctx.resume
            ? { type: "done" }
            : { type: "wait", wait: { kind: "manual", message: "等待" } },
        { kind: "manual" },
      ),
    ]);
    const waitingHarness = await makeHarness([workflow]);
    const waiting = await waitingHarness.engine.start("demo", {});
    const waitingResults = await Promise.allSettled([
      waitingHarness.engine.resume(waiting.runId),
      waitingHarness.engine.resume(waiting.runId),
    ]);
    expect(
      waitingResults.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      waitingResults.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      waitingResults.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: { code: "RUN_STATE_CONFLICT" },
    });

    const expiredHarness = await makeHarness([workflow]);
    const expiredRun = await expiredHarness.engine.start("demo", {});
    const current = expiredHarness.now();
    expect(
      expiredHarness.store.acquireRun(expiredRun.runId, {
        from: ["waiting"],
        owner: "stale-owner",
        leaseExpiresAt: new Date(current.getTime() + 10).toISOString(),
        now: current.toISOString(),
        takeOverExpired: false,
      }),
    ).toBe(true);
    expiredHarness.advance(11);
    const takeoverResults = await Promise.allSettled([
      expiredHarness.engine.resume(expiredRun.runId, undefined, {
        force: true,
      }),
      expiredHarness.engine.resume(expiredRun.runId, undefined, {
        force: true,
      }),
    ]);
    expect(
      takeoverResults.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      takeoverResults.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      takeoverResults.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: { code: "RUN_STATE_CONFLICT" },
    });
  });

  it.each([
    ["wait", { type: "wait", wait: { kind: "manual", message: "等待" } }],
    ["fail", { type: "fail", error: "步骤失败" }],
  ] as const)("失去执行权后 %s 结果不再写步骤记录", async (_label, outcome) => {
    const entered = deferred<void>();
    const finish = deferred<StepOutcome>();
    const harness = await makeHarness(
      [
        makeWorkflow([
          makeStep("long", async () => {
            entered.resolve();
            return finish.promise;
          }),
        ]),
      ],
      { leaseMs: 1_000 },
    );
    const execution = harness.engine.start("demo", {});
    await entered.promise;
    const before = harness.store.getSteps("run-1")[0];
    harness.advance(1_001);
    const now = harness.now();
    expect(
      harness.store.acquireRun("run-1", {
        from: [],
        owner: "replacement-owner",
        leaseExpiresAt: new Date(now.getTime() + 1_000).toISOString(),
        now: now.toISOString(),
        takeOverExpired: true,
      }),
    ).toBe(true);

    finish.resolve(outcome);
    await expect(execution).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
    });
    expect(harness.store.getSteps("run-1")[0]).toEqual(before);
    expect(harness.store.getRun("run-1")?.leaseOwner).toBe("replacement-owner");
  });

  it("heartbeat 延长租约；被接管后下一次续约停止且不再写步骤记录", async () => {
    const enteredHeartbeat = deferred<void>();
    const heartbeatGate = deferred<StepOutcome>();
    let expiryAfterHeartbeat: string | undefined;
    const workflow = makeWorkflow([
      makeStep("long", async (ctx) => {
        enteredHeartbeat.resolve();
        const outcome = await heartbeatGate.promise;
        ctx.heartbeat();
        expiryAfterHeartbeat = harness.store.getRun(ctx.runId)?.leaseExpiresAt;
        return outcome;
      }),
    ]);
    const harness = await makeHarness([workflow], { leaseMs: 1_000 });
    const initialPromise = harness.engine.start("demo", {});
    await enteredHeartbeat.promise;
    const runId = "run-1";
    const originalExpiry = harness.store.getRun(runId)?.leaseExpiresAt;
    harness.advance(500);
    heartbeatGate.resolve({ type: "done" });
    expect((await initialPromise).state).toBe("completed");
    expect(expiryAfterHeartbeat).not.toBe(originalExpiry);
    expect(
      Date.parse(expiryAfterHeartbeat ?? "") - harness.now().getTime(),
    ).toBe(1_000);

    const takeoverEntered = deferred<void>();
    const takeoverGate = deferred<StepOutcome>();
    const takeoverWorkflow = makeWorkflow([
      makeStep("long", async (ctx) => {
        takeoverEntered.resolve();
        const outcome = await takeoverGate.promise;
        ctx.heartbeat();
        return outcome;
      }),
    ]);
    const takeoverHarness = await makeHarness([takeoverWorkflow], {
      leaseMs: 1_000,
    });
    const running = takeoverHarness.engine.start("demo", {});
    await takeoverEntered.promise;
    const activeRun = takeoverHarness.store.getRun("run-1");
    takeoverHarness.advance(1_001);
    const now = takeoverHarness.now();
    expect(
      takeoverHarness.store.acquireRun("run-1", {
        from: [],
        owner: "new-owner",
        leaseExpiresAt: new Date(now.getTime() + 1_000).toISOString(),
        now: now.toISOString(),
        takeOverExpired: true,
      }),
    ).toBe(true);
    const stepBefore = takeoverHarness.store.getSteps("run-1")[0];
    takeoverGate.resolve({ type: "done" });
    await expect(running).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
      message: "执行权已被别的进程接管，本进程停止",
    });
    expect(takeoverHarness.store.getSteps("run-1")[0]).toEqual(stepBefore);
    expect(takeoverHarness.store.getRun("run-1")?.leaseOwner).toBe("new-owner");
    expect(activeRun?.leaseOwner).not.toBe("new-owner");
  });
});
