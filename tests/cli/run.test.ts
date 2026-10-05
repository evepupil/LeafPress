import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";

import { afterEach, describe, expect, it } from "vitest";

import { createCliContext } from "../../src/cli/context.js";
import {
  executeRunCancel,
  executeRunList,
  executeRunShow,
  register,
  renderRunList,
  renderRunShow,
} from "../../src/cli/commands/run.js";
import type {
  RunRecord,
  StepRecord,
  WorkflowDefinition,
} from "../../src/workflows/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function makeContext(options: { readonly json?: boolean } = {}) {
  tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-run-"));
  return createCliContext(
    { home: join(tempDir, "data"), ...(options.json ? { json: true } : {}) },
    { env: {}, homedir: tempDir, edgeLocator: () => undefined },
  );
}

function seedRun(
  context: ReturnType<typeof createCliContext>,
  id: string,
  state: RunRecord["state"],
  options: {
    readonly leaseExpiresAt?: string;
    readonly wait?: StepRecord["wait"];
  } = {},
): void {
  const time = "2026-10-05T12:34:56.000Z";
  const run: RunRecord = {
    id,
    workflowId: "test-workflow",
    params: {},
    state,
    cursor: 0,
    createdAt: time,
    updatedAt: time,
    ...(state === "running"
      ? {
          leaseOwner: "previous-process",
          leaseExpiresAt: options.leaseExpiresAt ?? time,
        }
      : {}),
  };
  const step: StepRecord = {
    runId: id,
    stepId: "prepare",
    index: 0,
    status:
      state === "waiting"
        ? "waiting"
        : state === "failed"
          ? "failed"
          : state === "running"
            ? "running"
            : "done",
    inputHashes: {},
    attempts: 2,
    ...(options.wait === undefined ? {} : { wait: options.wait }),
    ...(state === "failed" ? { error: "测试步骤失败" } : {}),
  };
  context.getStore().runs.createRun(run, [step]);
}

const workflow: WorkflowDefinition = {
  id: "test-workflow",
  title: "测试工作流",
  parseParams: () => ({}),
  steps: [
    {
      id: "prepare",
      title: "准备内容",
      kind: "ai",
      inputFiles: () => [],
      run: () => Promise.resolve({ type: "done" as const }),
    },
  ],
};

async function captureStdout(run: () => Promise<unknown>): Promise<string> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let output = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  };
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}

describe("run 命令", () => {
  it("无数据库时 list 为空且 show/cancel 报运行不存在，不创建数据目录", async () => {
    const context = await makeContext();
    const dataDir = join(tempDir ?? "", "data");
    try {
      expect(existsSync(dataDir)).toBe(false);
      expect(executeRunList(context)).toEqual([]);
      expect(existsSync(dataDir)).toBe(false);
      expect(() => executeRunShow(context, "missing-run")).toThrow(
        "找不到运行",
      );
      expect(() => executeRunCancel(context, "missing-run")).toThrow(
        "找不到运行",
      );
      expect(existsSync(dataDir)).toBe(false);
      const humanProgram = new Command();
      register(humanProgram, () => context);
      const humanOutput = await captureStdout(() =>
        humanProgram.parseAsync(["run", "list"], { from: "user" }),
      );
      expect(humanOutput).toBe("没有运行记录\n");
      expect(existsSync(dataDir)).toBe(false);
    } finally {
      context.close();
    }
  });

  it("JSON list/show/cancel 成功结果统一包装 ok 和 runs/run", async () => {
    const context = await makeContext({ json: true });
    try {
      const listProgram = new Command().option("--json", "JSON output");
      register(listProgram, () => context);
      const listOutput = await captureStdout(() =>
        listProgram.parseAsync(["--json", "run", "list"], { from: "user" }),
      );
      expect(JSON.parse(listOutput)).toEqual({ ok: true, runs: [] });
      expect(existsSync(context.home)).toBe(false);

      seedRun(context, "waiting-run", "waiting");
      const showProgram = new Command().option("--json", "JSON output");
      register(showProgram, () => context);
      const showOutput = await captureStdout(() =>
        showProgram.parseAsync(["--json", "run", "show", "waiting-run"], {
          from: "user",
        }),
      );
      expect(JSON.parse(showOutput)).toMatchObject({
        ok: true,
        run: { runId: "waiting-run", state: "waiting" },
      });

      const cancelProgram = new Command().option("--json", "JSON output");
      register(cancelProgram, () => context);
      const cancelOutput = await captureStdout(() =>
        cancelProgram.parseAsync(["--json", "run", "cancel", "waiting-run"], {
          from: "user",
        }),
      );
      expect(JSON.parse(cancelOutput)).toMatchObject({
        ok: true,
        run: { runId: "waiting-run", state: "cancelled" },
      });
    } finally {
      context.close();
    }
  });

  it("默认只列未结束运行，--all 包含所有状态并显示中文状态", async () => {
    const context = await makeContext();
    try {
      for (const state of [
        "running",
        "waiting",
        "failed",
        "completed",
        "cancelled",
      ] as const) {
        seedRun(context, state, state);
      }
      const active = executeRunList(context);
      expect(active.map((run) => run.state).sort()).toEqual([
        "failed",
        "running",
        "waiting",
      ]);
      expect(executeRunList(context, { all: true })).toHaveLength(5);
      const output = renderRunList(active, [workflow]);
      expect(output).toContain("测试工作流");
      expect(output).toContain("运行中");
      expect(output).toContain("2026-");
      expect(output).not.toContain("已完成");
    } finally {
      context.close();
    }
  });

  it("show 列出步骤、等待说明和相关文件路径", async () => {
    const context = await makeContext();
    try {
      seedRun(context, "waiting-run", "waiting", {
        wait: {
          kind: "ai",
          message: "等待生成文章草稿",
          taskFile: join(tempDir ?? "", "task.md"),
          outputFile: join(tempDir ?? "", "draft.md"),
        },
      });
      const detail = executeRunShow(context, "waiting-run");
      const output = renderRunShow(detail, [workflow]);
      expect(output).toContain("准备内容");
      expect(output).toContain("AI");
      expect(renderRunShow(detail)).toContain("AI");
      expect(output).toContain("等待生成文章草稿");
      expect(output).toContain("task.md");
      expect(output).toContain("draft.md");
    } finally {
      context.close();
    }
  });

  it("cancel 可取消等待中运行，但运行中的活租约拒绝取消", async () => {
    const context = await makeContext();
    try {
      seedRun(context, "waiting-run", "waiting");
      expect(
        executeRunCancel(context, "waiting-run", { force: true }).state,
      ).toBe("cancelled");
      seedRun(context, "running-live", "running", {
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(() =>
        executeRunCancel(context, "running-live", { force: true }),
      ).toThrow("正在运行，不能取消");
    } finally {
      context.close();
    }
  });

  it("--force 只接管已过期的运行租约", async () => {
    const context = await makeContext();
    try {
      seedRun(context, "running-expired", "running", {
        leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      const report = executeRunCancel(context, "running-expired", {
        force: true,
      });
      expect(report.state).toBe("cancelled");
    } finally {
      context.close();
    }
  });
});
