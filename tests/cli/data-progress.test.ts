import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PullSummary, UseCases } from "@leafpress/core";
import { afterEach, describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { run as runData } from "../../src/cli/commands/data.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

type PullInput = Parameters<UseCases["pullData"]>[0];

/** 假的用例：拉的过程中按给定的话报进度，最后返回固定结果 */
async function setup(progress: [string, string][]) {
  tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-data-progress-"));
  const calls: PullInput[] = [];
  const summary: PullSummary = {
    outcomes: [{ accountId: "blog-1", status: "ok" }],
    note: "入库 37 篇文章，补了 182 天历史",
  };
  const usecases = {
    pullData(input: PullInput) {
      calls.push(input);
      for (const [accountId, message] of progress) {
        input?.onProgress?.(accountId, message);
      }
      return Promise.resolve(summary);
    },
  } as unknown as UseCases;
  const context = createCliContext(
    { home: join(tempDir, "home"), json: false },
    { env: {}, homedir: tempDir, useCases: usecases, platform: "win32" },
  );
  return { context, calls };
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const original = process.stdout.write.bind(process.stdout);
  let stdout = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  try {
    await run();
    return stdout;
  } finally {
    process.stdout.write = original;
  }
}

describe("leafpress data pull 的进度", () => {
  it("每报一次进度写一行「账号：原话」，标准输出只有结果", async () => {
    const { context, calls } = await setup([
      ["blog-1", "补历史：第 10/182 天"],
      ["blog-1", "补历史：第 20/182 天"],
    ]);
    const lines: string[] = [];
    const stdout = await captureStdout(() =>
      runData(context, ["pull", {}], {
        writeProgress: (line) => lines.push(line),
      }),
    );
    expect(lines).toEqual([
      "blog-1：补历史：第 10/182 天",
      "blog-1：补历史：第 20/182 天",
    ]);
    expect(stdout).toBe("入库 37 篇文章，补了 182 天历史\n");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.accountIds).toBeUndefined();
  });

  it("指定账号时照样把账号交给用例，并接上进度", async () => {
    const { context, calls } = await setup([["blog-1", "补历史：第 10/12 天"]]);
    const lines: string[] = [];
    await captureStdout(() =>
      runData(context, ["pull", { account: "blog-1" }], {
        writeProgress: (line) => lines.push(line),
      }),
    );
    expect(calls[0]?.accountIds).toEqual(["blog-1"]);
    expect(lines).toEqual(["blog-1：补历史：第 10/12 天"]);
  });
});
