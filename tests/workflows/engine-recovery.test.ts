import {
  mkdir,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
/* eslint-disable @typescript-eslint/require-await -- Step fixtures use async outcomes to mirror the engine contract. */
import { describe, expect, it, vi } from "vitest";

import { makeHarness, makeStep, makeWorkflow } from "./helpers.js";

describe("工作流恢复与作废", () => {
  it("上游输入修改或删除后作废并重跑依赖步骤", async () => {
    for (const change of ["修改", "删除"] as const) {
      let reruns = 0;
      const workflow = makeWorkflow([
        makeStep("source", async (ctx) => {
          const path = join(ctx.runDir, "source.md");
          await writeFile(path, "初稿");
          return { type: "done", outputs: { path } };
        }),
        makeStep(
          "convert",
          async () => {
            reruns += 1;
            return { type: "done", outputs: { version: reruns } };
          },
          { inputFiles: (ctx) => [String(ctx.outputs.source?.path)] },
        ),
        makeStep(
          "wait",
          async () => ({
            type: "wait",
            wait: { kind: "manual", message: "等待外部操作" },
          }),
          { kind: "manual" },
        ),
      ]);
      const harness = await makeHarness([workflow]);
      const waiting = await harness.engine.start("demo", {});
      const inputPath = String(
        harness.store.getSteps(waiting.runId)[0]?.outputs?.path,
      );
      if (change === "修改") await writeFile(inputPath, "新初稿");
      else await unlink(inputPath);

      const report = await harness.engine.resume(waiting.runId);
      expect(report.state).toBe("waiting");
      expect(reruns).toBe(2);
      expect(harness.store.getSteps(waiting.runId)[1]?.attempts).toBe(2);
      expect(await readFile(inputPath, "utf8").catch(() => "missing")).toBe(
        change === "修改" ? "新初稿" : "missing",
      );
    }
  });

  it("修改多个输入中的第二个也会作废，并清除目标之后的旧记录", async () => {
    let conversions = 0;
    const workflow = makeWorkflow([
      makeStep("source", async (ctx) => {
        const first = join(ctx.runDir, "first.txt");
        const second = join(ctx.runDir, "second.txt");
        await writeFile(first, "first");
        await writeFile(second, "second");
        return { type: "done", outputs: { first, second } };
      }),
      makeStep(
        "convert",
        async (ctx) => {
          conversions += 1;
          if (conversions === 2) {
            expect(Object.keys(ctx.outputs)).toEqual(["source"]);
          }
          return { type: "done", outputs: { version: conversions } };
        },
        {
          inputFiles: (ctx) => [
            String(ctx.outputs.source?.first),
            String(ctx.outputs.source?.second),
          ],
        },
      ),
      makeStep(
        "wait",
        async () => ({
          type: "wait",
          wait: { kind: "manual", message: "等待" },
        }),
        { kind: "manual" },
      ),
      makeStep("later", async () => ({ type: "done" })),
    ]);
    const harness = await makeHarness([workflow]);
    const waiting = await harness.engine.start("demo", {});
    const paths = harness.store.getSteps(waiting.runId)[0]?.outputs;
    const firstPath = String(paths?.first);
    const secondPath = String(paths?.second);
    harness.store.updateStep(waiting.runId, "later", {
      status: "done",
      outputs: { stale: true },
    });
    await writeFile(secondPath, "changed second");

    const report = await harness.engine.resume(waiting.runId);

    expect(report.state).toBe("waiting");
    expect(conversions).toBe(2);
    expect(await readFile(firstPath, "utf8")).toBe("first");
    expect(
      harness.store.getSteps(waiting.runId).map((step) => step.status),
    ).toEqual(["done", "done", "waiting", "pending"]);
    expect(harness.store.getSteps(waiting.runId)[3]?.outputs).toBeUndefined();
  });

  it("非空旧目录遇到同名归档会递增序号，空目录不归档", async () => {
    let sourceRuns = 0;
    let rewriteRuns = 0;
    const workflow = makeWorkflow([
      makeStep("source", async (ctx) => {
        sourceRuns += 1;
        const path = join(ctx.runDir, "source.txt");
        await writeFile(path, `source ${sourceRuns}`);
        return { type: "done", outputs: { path } };
      }),
      makeStep(
        "rewrite",
        async () => {
          rewriteRuns += 1;
          return {
            type: "wait",
            wait: { kind: "ai", message: "等待结果" },
          };
        },
        {
          kind: "ai",
          inputFiles: (ctx) => [String(ctx.outputs.source?.path)],
        },
      ),
    ]);
    const harness = await makeHarness([workflow]);
    const waiting = await harness.engine.start("demo", {});
    const stepDir = join(harness.directory, waiting.runId, "rewrite");
    expect(await readdir(stepDir)).toEqual([]);
    const sourcePath = String(
      harness.store.getSteps(waiting.runId)[0]?.outputs?.path,
    );
    await writeFile(sourcePath, "changed");

    const report = await harness.engine.resume(waiting.runId);

    expect(report.state).toBe("waiting");
    expect(rewriteRuns).toBe(2);
    expect(await readdir(stepDir)).toEqual([]);
    expect(await readdir(join(harness.directory, waiting.runId))).not.toContain(
      "rewrite.old-1",
    );
  });

  it("恢复时旧输入读取错误按该步骤失败并交还租约", async () => {
    const harness = await makeHarness([
      makeWorkflow([
        makeStep(
          "wait",
          async () => ({
            type: "wait",
            wait: { kind: "ai", message: "等待" },
          }),
          {
            kind: "ai",
            inputFiles: (ctx) => [join(ctx.runDir, "input")],
          },
        ),
      ]),
    ]);
    const waiting = await harness.engine.start("demo", {});
    const inputPath = join(harness.directory, waiting.runId, "input");
    await mkdir(inputPath);

    const report = await harness.engine.resume(waiting.runId);

    expect(report.state).toBe("failed");
    expect(report.currentStep?.id).toBe("wait");
    expect(report.error).toContain("内部错误：");
    expect(harness.store.getSteps(waiting.runId)[0]?.status).toBe("failed");
    expect(harness.store.getRun(waiting.runId)?.leaseOwner).toBeUndefined();
  });

  it("历史已完成步骤输入读取失败时回退游标并清除该步输出和全部后续记录", async () => {
    const inputPathRef: { value?: string } = {};
    const getInputPath = () => {
      const path = inputPathRef.value;
      if (!path) throw new Error("测试输入路径尚未准备");
      return path;
    };
    let sourceRuns = 0;
    let waitRuns = 0;
    const workflow = makeWorkflow([
      makeStep(
        "source",
        async () => {
          sourceRuns += 1;
          return { type: "done", outputs: { version: sourceRuns } };
        },
        { inputFiles: () => [getInputPath()] },
      ),
      makeStep(
        "review",
        async () => {
          waitRuns += 1;
          return waitRuns === 1
            ? {
                type: "wait",
                wait: { kind: "manual", message: "等待确认" },
              }
            : { type: "done" };
        },
        { kind: "manual" },
      ),
      makeStep("publish", async (ctx) => {
        expect(ctx.outputs).toEqual({
          source: { version: 2 },
          review: {},
        });
        return { type: "done" };
      }),
    ]);
    const harness = await makeHarness([workflow]);
    inputPathRef.value = join(harness.directory, "external-input.txt");
    await writeFile(getInputPath(), "initial");

    const waiting = await harness.engine.start("demo", {});
    harness.store.updateStep(waiting.runId, "publish", {
      status: "done",
      outputs: { stale: true },
    });
    await unlink(getInputPath());
    await mkdir(getInputPath());

    const failed = await harness.engine.resume(waiting.runId);

    expect(failed.state).toBe("failed");
    expect(harness.store.getRun(waiting.runId)?.cursor).toBe(0);
    const failedSteps = harness.store.getSteps(waiting.runId);
    expect(failedSteps.map((step) => step.status)).toEqual([
      "failed",
      "pending",
      "pending",
    ]);
    expect(failedSteps[0]?.outputs).toBeUndefined();
    expect(failedSteps[1]?.wait).toBeUndefined();
    expect(failedSteps[2]?.outputs).toBeUndefined();

    await rm(getInputPath(), { recursive: true });
    await writeFile(getInputPath(), "repaired");
    const recovered = await harness.engine.resume(waiting.runId);

    expect(recovered.state).toBe("completed");
    expect(sourceRuns).toBe(2);
    expect(waitRuns).toBe(2);
  });

  it("等待中的输入变化会重新执行 AI 步骤并归档旧步骤目录", async () => {
    const resumeValues: Array<unknown> = [];
    const stepDirectories: string[] = [];
    let executions = 0;
    const workflow = makeWorkflow([
      makeStep("source", async (ctx) => {
        const path = join(ctx.runDir, "source.md");
        await writeFile(path, "初稿");
        return { type: "done", outputs: { path } };
      }),
      makeStep(
        "rewrite",
        async (ctx) => {
          executions += 1;
          stepDirectories.push(ctx.stepDir);
          resumeValues.push(ctx.resume);
          await writeFile(join(ctx.stepDir, "task.md"), `任务 ${executions}`);
          if (executions === 1 || !ctx.resume) {
            return {
              type: "wait",
              wait: { kind: "ai", message: "请改写" },
            };
          }
          return { type: "done" };
        },
        {
          kind: "ai",
          inputFiles: (ctx) => [String(ctx.outputs.source?.path)],
        },
      ),
    ]);
    const harness = await makeHarness([workflow]);
    const waiting = await harness.engine.start("demo", {});
    const inputPath = String(
      harness.store.getSteps(waiting.runId)[0]?.outputs?.path,
    );
    await mkdir(join(harness.directory, waiting.runId, "rewrite.old-1"));
    await writeFile(
      join(harness.directory, waiting.runId, "rewrite.old-1", "marker.md"),
      "collision",
    );
    await writeFile(inputPath, "修改后的初稿");

    const report = await harness.engine.resume(waiting.runId, {
      approve: true,
    });

    expect(report.state).toBe("waiting");
    expect(executions).toBe(2);
    expect(resumeValues).toEqual([undefined, undefined]);
    const archive = join(harness.directory, waiting.runId, "rewrite.old-1-1");
    await expect(readFile(join(archive, "task.md"), "utf8")).resolves.toBe(
      "任务 1",
    );
    await expect(
      readFile(
        join(harness.directory, waiting.runId, "rewrite.old-1", "marker.md"),
        "utf8",
      ),
    ).resolves.toBe("collision");
    expect(stepDirectories[0]).toBe(stepDirectories[1]);
  });

  it("执行期间输入变化会重跑，超过回退上限后失败", async () => {
    let executions = 0;
    const workflow = makeWorkflow([
      makeStep(
        "unstable",
        async (ctx) => {
          executions += 1;
          await writeFile(join(ctx.runDir, "input.txt"), `版本 ${executions}`);
          return { type: "done" };
        },
        { inputFiles: (ctx) => [join(ctx.runDir, "input.txt")] },
      ),
    ]);
    const harness = await makeHarness([workflow], { maxRewinds: 2 });

    const report = await harness.engine.start("demo", {});

    expect(report.state).toBe("failed");
    expect(report.error).toBe("回退次数过多，可能陷入循环");
    expect(executions).toBe(3);
    expect(harness.store.getSteps(report.runId)[0]?.attempts).toBe(3);
  });

  it("回退将目标及后续记录全部清空，输出仅包含 done 步骤", async () => {
    const harnessRef: {
      current: Awaited<ReturnType<typeof makeHarness>> | undefined;
    } = { current: undefined };
    const getHarness = () => {
      const value = harnessRef.current;
      if (!value) throw new Error("测试引擎尚未创建");
      return value;
    };
    let aRuns = 0;
    let bRuns = 0;
    let reviewRuns = 0;
    const workflow = makeWorkflow([
      makeStep("a", async (ctx) => {
        aRuns += 1;
        if (aRuns === 2) {
          expect(
            getHarness()
              .store.getSteps(ctx.runId)
              .map((step) => step.status),
          ).toEqual(["running", "pending", "pending", "pending"]);
          expect(ctx.outputs).toEqual({});
        }
        return { type: "done", outputs: { value: aRuns } };
      }),
      makeStep("b", async (ctx) => {
        bRuns += 1;
        if (bRuns === 2) expect(ctx.outputs).toEqual({ a: { value: 2 } });
        return { type: "done", outputs: { value: bRuns } };
      }),
      makeStep("review", async (ctx) => {
        reviewRuns += 1;
        if (reviewRuns === 1) {
          getHarness().store.updateStep(ctx.runId, "later", {
            status: "done",
            outputs: { stale: true },
          });
          return { type: "rewind", toStepId: "a", reason: "重做" };
        }
        expect(ctx.outputs).toEqual({ a: { value: 2 }, b: { value: 2 } });
        return { type: "done" };
      }),
      makeStep("later", async (ctx) => {
        expect(ctx.outputs).toEqual({
          a: { value: 2 },
          b: { value: 2 },
          review: {},
        });
        return { type: "done" };
      }),
    ]);
    const harness = await makeHarness([workflow]);
    harnessRef.current = harness;

    const report = await harness.engine.start("demo", {});

    expect(report.error).toBeUndefined();
    expect(report).toMatchObject({ state: "completed" });
    expect(
      harness.store.getSteps(report.runId).map((step) => step.status),
    ).toEqual(["done", "done", "done", "done"]);
  });

  it("恢复时游标若已标记完成会前移而不重复执行", async () => {
    const finalStep = vi.fn(async () => ({
      type: "wait" as const,
      wait: { kind: "manual" as const, message: "先停下" },
    }));
    const harness = await makeHarness([
      makeWorkflow([
        makeStep("first", async () => ({ type: "done" })),
        makeStep("last", finalStep, { kind: "manual" }),
      ]),
    ]);
    const waiting = await harness.engine.start("demo", {});
    harness.store.updateStep(waiting.runId, "last", {
      status: "done",
      outputs: {},
      wait: null,
      error: null,
    });

    const report = await harness.engine.resume(waiting.runId);

    expect(report.state).toBe("completed");
    expect(finalStep).toHaveBeenCalledOnce();
    expect(harness.store.getRun(waiting.runId)?.cursor).toBe(2);
  });

  it("工作流步骤定义变化时拒绝恢复且不改变运行状态", async () => {
    const original = makeWorkflow([
      makeStep("first", async () => ({ type: "done" })),
      makeStep(
        "second",
        async () => ({
          type: "wait",
          wait: { kind: "manual", message: "等待" },
        }),
        { kind: "manual" },
      ),
    ]);
    const harness = await makeHarness([original]);
    const waiting = await harness.engine.start("demo", {});
    const changed = makeWorkflow(
      [
        makeStep("second", async () => ({ type: "done" })),
        makeStep("first", async () => ({ type: "done" })),
      ],
      { id: "demo" },
    );
    const changedEngine = harness.createEngine([changed]);

    await expect(changedEngine.resume(waiting.runId)).rejects.toMatchObject({
      code: "RUN_STATE_CONFLICT",
      message: "工作流定义已经变了，这次运行没法恢复，请取消后重新开始",
    });
    expect(harness.store.getRun(waiting.runId)?.state).toBe("waiting");
    expect(harness.store.getRun(waiting.runId)?.leaseOwner).toBeUndefined();
  });

  it("无效 rewind 目标和超过回退上限都按失败处理", async () => {
    const invalidHarness = await makeHarness([
      makeWorkflow([
        makeStep("step", async () => ({
          type: "rewind",
          toStepId: "missing",
          reason: "错误编号",
        })),
      ]),
    ]);
    const invalid = await invalidHarness.engine.start("demo", {});
    expect(invalid.state).toBe("failed");
    expect(invalid.error).toBe("回退目标无效");

    const forwardHarness = await makeHarness([
      makeWorkflow([
        makeStep("first", async () => ({
          type: "rewind",
          toStepId: "later",
          reason: "不能前向回退",
        })),
        makeStep("later", async () => ({ type: "done" })),
      ]),
    ]);
    const forward = await forwardHarness.engine.start("demo", {});
    expect(forward.state).toBe("failed");
    expect(forward.error).toBe("回退目标无效");

    let attempts = 0;
    const loopingHarness = await makeHarness(
      [
        makeWorkflow([
          makeStep("loop", async () => {
            attempts += 1;
            return { type: "rewind", toStepId: "loop", reason: "重复" };
          }),
        ]),
      ],
      { maxRewinds: 1 },
    );
    const looping = await loopingHarness.engine.start("demo", {});
    expect(looping.state).toBe("failed");
    expect(looping.error).toBe("回退次数过多，可能陷入循环");
    expect(attempts).toBe(2);
  });
});
