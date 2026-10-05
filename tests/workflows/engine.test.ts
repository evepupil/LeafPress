/* eslint-disable @typescript-eslint/require-await -- Step fixtures use async outcomes to mirror the engine contract. */
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { LeafPressError } from "../../src/shared/errors.js";
import { newRunId } from "../../src/workflows/run-id.js";
import type { StepContext } from "../../src/workflows/types.js";
import { makeHarness, makeStep, makeWorkflow } from "./helpers.js";

describe("工作流启动与推进", () => {
  it("代码步骤按序完成、传递输出并创建步骤目录", async () => {
    const nextStep = vi.fn(async (ctx: StepContext) => {
      expect(ctx.outputs.prepare).toEqual({ value: 7 });
      await writeFile(join(ctx.stepDir, "result.txt"), "完成");
      return { type: "done" as const };
    });
    const workflow = makeWorkflow([
      makeStep("prepare", async () => ({
        type: "done",
        outputs: { value: 7 },
      })),
      makeStep("finish", nextStep),
    ]);
    const harness = await makeHarness([workflow]);

    const report = await harness.engine.start("demo", {});

    expect(report.state).toBe("completed");
    expect(nextStep).toHaveBeenCalledOnce();
    expect(harness.store.getRun(report.runId)).toMatchObject({
      cursor: 2,
      state: "completed",
    });
    expect(harness.store.getRun(report.runId)?.leaseOwner).toBeUndefined();
    expect(
      harness.store.getSteps(report.runId).map((step) => step.status),
    ).toEqual(["done", "done"]);
    await expect(
      access(join(harness.directory, report.runId, "prepare")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(harness.directory, report.runId, "finish")),
    ).resolves.toBeUndefined();
  });

  it("AI 步骤等待后保留目录并接收恢复输入", async () => {
    const resumed = vi.fn();
    const workflow = makeWorkflow([
      makeStep(
        "rewrite",
        async (ctx) => {
          if (!ctx.resume) {
            await writeFile(join(ctx.stepDir, "output.md"), "AI 结果");
            return {
              type: "wait",
              wait: {
                kind: "ai",
                message: "请完成改写",
                taskFile: join(ctx.stepDir, "task.md"),
                outputFile: join(ctx.stepDir, "output.md"),
              },
            };
          }
          const result = await readFile(join(ctx.stepDir, "output.md"), "utf8");
          resumed(ctx.resume, result);
          return { type: "done", outputs: { text: result } };
        },
        { kind: "ai" },
      ),
      makeStep("publish", async () => ({ type: "done" })),
    ]);
    const harness = await makeHarness([workflow]);

    const waiting = await harness.engine.start("demo", {});
    expect(waiting.state).toBe("waiting");
    expect(waiting.currentStep?.id).toBe("rewrite");
    expect(waiting.wait?.taskFile).toContain("task.md");
    expect(harness.store.getRun(waiting.runId)?.leaseOwner).toBeUndefined();

    const report = await harness.engine.resume(waiting.runId);
    expect(report.state).toBe("completed");
    expect(resumed).toHaveBeenCalledWith({}, "AI 结果");
    expect(harness.store.getSteps(waiting.runId)[0]?.attempts).toBe(2);
    await expect(
      access(join(harness.directory, waiting.runId, "rewrite.old-1")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("确认同意后继续，驳回时回退并重跑目标步骤", async () => {
    let draftRuns = 0;
    const workflow = makeWorkflow([
      makeStep("draft", async () => {
        draftRuns += 1;
        return { type: "done", outputs: { version: draftRuns } };
      }),
      makeStep(
        "confirm",
        async (ctx) => {
          if (ctx.resume?.reject) {
            return { type: "rewind", toStepId: "draft", reason: "需要修改" };
          }
          if (ctx.resume?.approve || draftRuns > 1) return { type: "done" };
          return {
            type: "wait",
            wait: { kind: "confirm", message: "请确认" },
          };
        },
        { kind: "confirm" },
      ),
    ]);
    const harness = await makeHarness([workflow]);

    const waiting = await harness.engine.start("demo", {});
    const rejected = await harness.engine.resume(waiting.runId, {
      reject: "不合适",
    });

    expect(rejected.state).toBe("completed");
    expect(draftRuns).toBe(2);
    expect(harness.store.getSteps(waiting.runId)[0]?.attempts).toBe(2);

    const approvedHarness = await makeHarness([
      makeWorkflow([
        makeStep(
          "confirm",
          async (ctx) =>
            ctx.resume?.approve
              ? { type: "done" }
              : { type: "wait", wait: { kind: "confirm", message: "请确认" } },
          { kind: "confirm" },
        ),
      ]),
    ]);
    const approval = await approvedHarness.engine.start("demo", {});
    expect(
      (await approvedHarness.engine.resume(approval.runId, { approve: true }))
        .state,
    ).toBe("completed");
  });

  it("失败结果与异常都能恢复重试，异常信息不包含调用栈", async () => {
    let attempts = 0;
    const workflow = makeWorkflow([
      makeStep("unstable", async () => {
        attempts += 1;
        return attempts === 1
          ? { type: "fail", error: "暂时失败" }
          : { type: "done" };
      }),
    ]);
    const harness = await makeHarness([workflow]);
    const failed = await harness.engine.start("demo", {});
    expect(failed.state).toBe("failed");
    expect(failed.error).toBe("暂时失败");
    expect(harness.store.getSteps(failed.runId)[0]).toMatchObject({
      status: "failed",
      error: "暂时失败",
    });
    expect(harness.store.getRun(failed.runId)?.leaseOwner).toBeUndefined();
    expect((await harness.engine.resume(failed.runId)).state).toBe("completed");
    expect(harness.store.getSteps(failed.runId)[0]?.attempts).toBe(2);

    const thrownHarness = await makeHarness([
      makeWorkflow([
        makeStep("throws", async () => {
          throw new Error("步骤异常");
        }),
      ]),
    ]);
    const thrown = await thrownHarness.engine.start("demo", {});
    expect(thrown.state).toBe("failed");
    expect(thrown.error).toBe("内部错误：步骤异常");
    expect(thrown.error).not.toContain("at ");
    expect(thrownHarness.store.getSteps(thrown.runId)[0]).toMatchObject({
      status: "failed",
      error: "内部错误：步骤异常",
    });

    const leafThrownHarness = await makeHarness([
      makeWorkflow([
        makeStep("throws", async () => {
          throw new LeafPressError("INTERNAL", "工作流步骤错误");
        }),
      ]),
    ]);
    const leafThrown = await leafThrownHarness.engine.start("demo", {});
    expect(leafThrown.state).toBe("failed");
    expect(leafThrown.error).toBe("工作流步骤错误");
    expect(leafThrownHarness.store.getSteps(leafThrown.runId)[0]).toMatchObject(
      {
        status: "failed",
        error: "工作流步骤错误",
      },
    );
  });

  it("inputFiles 抛错和输入路径不可读都按步骤失败释放租约", async () => {
    const callbackFailure = await makeHarness([
      makeWorkflow([
        makeStep("snapshot", async () => ({ type: "done" }), {
          inputFiles() {
            throw new Error("无法列出输入");
          },
        }),
      ]),
    ]);
    const callbackReport = await callbackFailure.engine.start("demo", {});
    expect(callbackReport.state).toBe("failed");
    expect(callbackReport.error).toBe("内部错误：无法列出输入");
    expect(
      callbackFailure.store.getSteps(callbackReport.runId)[0],
    ).toMatchObject({
      status: "failed",
      attempts: 1,
    });
    expect(
      callbackFailure.store.getRun(callbackReport.runId)?.leaseOwner,
    ).toBeUndefined();

    const directoryInput = await makeHarness([
      makeWorkflow([
        makeStep("snapshot", async () => ({ type: "done" }), {
          inputFiles: (ctx) => [ctx.runDir],
        }),
      ]),
    ]);
    const directoryReport = await directoryInput.engine.start("demo", {});
    expect(directoryReport.state).toBe("failed");
    expect(directoryReport.error).toContain("内部错误：");
    expect(
      directoryInput.store.getSteps(directoryReport.runId)[0]?.status,
    ).toBe("failed");
    expect(
      directoryInput.store.getRun(directoryReport.runId)?.leaseOwner,
    ).toBeUndefined();
  });

  it("步骤跑完后核对输入时发生读取错误按该步骤失败", async () => {
    const workflow = makeWorkflow([
      makeStep(
        "snapshot",
        async (ctx) => {
          const path = join(ctx.runDir, "input.txt");
          await unlink(path);
          await mkdir(path);
          return { type: "done", outputs: { stale: true } };
        },
        {
          inputFiles: (ctx) => {
            const path = join(ctx.runDir, "input.txt");
            writeFileSync(path, "input");
            return [path];
          },
        },
      ),
      makeStep("later", async () => ({ type: "done" })),
    ]);
    const harness = await makeHarness([workflow]);

    const report = await harness.engine.start("demo", {});

    expect(report.state).toBe("failed");
    expect(report.error).toContain("内部错误：");
    expect(harness.store.getRun(report.runId)?.cursor).toBe(0);
    expect(harness.store.getSteps(report.runId)[0]).toMatchObject({
      status: "failed",
      error: report.error,
      attempts: 1,
    });
    expect(harness.store.getSteps(report.runId)[0]?.outputs).toBeUndefined();
    expect(harness.store.getSteps(report.runId)[1]?.status).toBe("pending");
  });

  it("拒绝未知工作流、不合法参数和重复或不合规编号", async () => {
    const workflow = makeWorkflow([], {
      parseParams() {
        throw new LeafPressError("USAGE", "参数无效");
      },
    });
    const harness = await makeHarness([workflow]);
    await expect(harness.engine.start("missing", {})).rejects.toMatchObject({
      code: "WORKFLOW_UNKNOWN",
    });
    await expect(harness.engine.start("demo", {})).rejects.toMatchObject({
      code: "USAGE",
      message: "参数无效",
    });

    const duplicate = makeStep("same", async () => ({ type: "done" }));
    expect(() =>
      harness.createEngine([makeWorkflow([duplicate, duplicate])]),
    ).toThrowError(LeafPressError);
    expect(() =>
      harness.createEngine([
        makeWorkflow([makeStep("Bad_ID", async () => ({ type: "done" }))]),
      ]),
    ).toThrowError(LeafPressError);
    expect(() =>
      harness.createEngine([
        makeWorkflow([], { id: "same" }),
        makeWorkflow([], { id: "same" }),
      ]),
    ).toThrowError(LeafPressError);
  });

  it("生成本地时间运行编号和四位小写字母数字后缀", () => {
    const time = new Date(2026, 9, 5, 20, 15, 30);
    expect(newRunId(time)).toMatch(/^20261005-201530-[a-z0-9]{4}$/);
  });
});
