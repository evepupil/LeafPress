import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toIsoTime, type PullSummary, type UseCases } from "@leafpress/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { run as runData } from "../../src/cli/commands/data.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function cast<T>(value: unknown): T {
  return value as T;
}

async function setup(summary: PullSummary, json = false) {
  tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-data-scheduled-"));
  const pullData = vi.fn((input?: Parameters<UseCases["pullData"]>[0]) => {
    void input;
    return Promise.resolve(summary);
  });
  const usecases = cast<UseCases>({ pullData });
  const context = createCliContext(
    { home: join(tempDir, "home"), json },
    { env: {}, homedir: tempDir, useCases: usecases, platform: "win32" },
  );
  const recordScheduledRun = vi.fn();
  return { context, pullData, recordScheduledRun };
}

async function capture(run: () => Promise<void>) {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  };
  try {
    await run();
    return { stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("leafpress data pull --scheduled", () => {
  it("用拉取 note 记成功结果并逐行输出", async () => {
    const summary: PullSummary = {
      outcomes: [{ accountId: "zhihu-1", status: "ok" }],
      note: "知乎：已入库 3 篇",
    };
    const { context, pullData, recordScheduledRun } = await setup(summary);
    const at = toIsoTime(new Date("2026-10-09T12:00:00.000Z"));
    const output = await capture(() =>
      runData(context, ["pull", { scheduled: true, account: "zhihu-1" }], {
        recordScheduledRun,
        now: () => new Date("2026-10-09T12:00:00.000Z"),
      }),
    );
    expect(recordScheduledRun).toHaveBeenCalledWith(context.paths, {
      at,
      result: "ok",
      note: "知乎：已入库 3 篇",
    });
    const input = pullData.mock.calls[0]?.[0];
    expect(input?.accountIds).toEqual(["zhihu-1"]);
    expect(typeof input?.onProgress).toBe("function");
    expect(output.stdout.split("\n")).toEqual(["知乎：已入库 3 篇", ""]);
    expect(output.stderr).toBe("");
    expect(context.exitCode).toBe(0);
  });

  it("有账号失败时记 failed 并以 1 退出，JSON 仍返回拉取结果", async () => {
    const summary: PullSummary = {
      outcomes: [
        { accountId: "zhihu-1", status: "ok" },
        { accountId: "blog-1", status: "failed", reason: "连接失败" },
      ],
      note: "博客：连接失败，其余已入库",
    };
    const { context, recordScheduledRun } = await setup(summary, true);
    const at = toIsoTime(new Date("2026-10-09T12:00:00.000Z"));
    const output = await capture(() =>
      runData(context, ["pull", { scheduled: true }], {
        recordScheduledRun,
        now: () => new Date("2026-10-09T12:00:00.000Z"),
      }),
    );
    expect(recordScheduledRun).toHaveBeenCalledWith(context.paths, {
      at,
      result: "failed",
      note: "博客：连接失败，其余已入库",
    });
    expect(JSON.parse(output.stdout)).toEqual({ ok: true, ...summary });
    expect(context.exitCode).toBe(1);
  });

  it("异常中断时 finally 记录失败结果后继续抛错", async () => {
    const summary: PullSummary = { outcomes: [], note: "" };
    const { context, pullData, recordScheduledRun } = await setup(summary);
    pullData.mockRejectedValue(new Error("连接中断"));
    const at = toIsoTime(new Date("2026-10-09T12:00:00.000Z"));

    await expect(
      runData(context, ["pull", { scheduled: true }], {
        recordScheduledRun,
        now: () => new Date("2026-10-09T12:00:00.000Z"),
      }),
    ).rejects.toThrow("连接中断");
    expect(recordScheduledRun).toHaveBeenCalledWith(context.paths, {
      at,
      result: "failed",
      note: "定时拉取失败：连接中断",
    });
  });

  it("普通拉取不写定时状态，部分失败不改变原退出行为", async () => {
    const summary: PullSummary = {
      outcomes: [{ accountId: "blog-1", status: "failed" }],
      note: "博客：连接失败",
    };
    const { context, recordScheduledRun } = await setup(summary);
    await runData(context, ["pull", {}], { recordScheduledRun });
    expect(recordScheduledRun).not.toHaveBeenCalled();
    expect(context.exitCode).toBe(0);
  });
});
