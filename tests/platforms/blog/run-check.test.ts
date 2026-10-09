/**
 * runCheck 的单元测试：跑一项 pnpm 检查时，成功、失败、超时、命令起不来各怎么整理结果。
 * 从 steps-units.test.ts 拆出来（那个文件超出了单文件 300 行的约定）。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCheck } from "../../../src/platforms/blog/steps/checks.js";
import type { CodeStepContext } from "../../../src/platforms/types.js";
import type { ExecResult } from "../../../src/shared/exec.js";
import { failure, isPnpmProbe, ok, timeout } from "./steps-fixtures.js";
let folder = "";

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "leafpress-runcheck-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** 只带 runCheck 用得到的字段的步骤上下文 */
function context(exec: CodeStepContext["exec"], secret?: string) {
  return {
    folder,
    exec,
    secret: () => secret,
    heartbeat: () => undefined,
  };
}

/**
 * 「pnpm 在不在」的探测按找到回答：runPnpm 第一次用之前会先发它，找不到就直接抛
 * PnpmNotFoundError，那就测不到这些用例本来的主题（检查命令没过时怎么整理结果）了。
 */
function execReplying(reply: () => ExecResult): CodeStepContext["exec"] {
  return (command, args) =>
    isPnpmProbe(command, args)
      ? Promise.resolve(ok())
      : Promise.resolve(reply());
}

describe("runCheck", () => {
  const spec = { name: "build", args: ["build"], timeoutMs: 8 * 60_000 };

  it("命令成功：通过，带用时", async () => {
    const result = await runCheck(
      context(() => Promise.resolve(ok())),
      folder,
      spec,
    );
    expect(result).toMatchObject({ name: "build", passed: true });
    expect(result.tail).toBeUndefined();
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("非零退出：没过，附输出末尾；没有输出时说明", async () => {
    const withOutput = await runCheck(
      context(execReplying(() => failure("第一行\n第二行"))),
      folder,
      spec,
    );
    expect(withOutput).toMatchObject({ passed: false, tail: "第一行\n第二行" });

    const silent = await runCheck(
      context(execReplying(() => failure(""))),
      folder,
      spec,
    );
    expect(silent.tail).toBe("命令失败，没有输出");
  });

  it("超时：没过，写明超过几分钟", async () => {
    const result = await runCheck(
      context(() => Promise.resolve(timeout())),
      folder,
      spec,
    );
    expect(result).toMatchObject({ passed: false });
    expect(result.tail).toBe("超过 8 分钟没跑完，已结束");
  });

  it("命令起不来（exec 抛错）：当作没过，不抛出", async () => {
    const result = await runCheck(
      context(() => Promise.reject(new Error("找不到命令 cmd.exe"))),
      folder,
      spec,
    );
    expect(result).toMatchObject({ passed: false, tail: "找不到命令 cmd.exe" });
  });

  it("输出里的密钥抹掉，只留最后 80 行", async () => {
    const lines = Array.from({ length: 100 }, (_, index) => `行${index + 1}`);
    lines[99] = "最后一行带着 s3cr3t-token";
    const result = await runCheck(
      context(
        execReplying(() => failure(lines.join("\n"))),
        "s3cr3t-token",
      ),
      folder,
      spec,
    );
    expect(result.tail?.split("\n")).toHaveLength(80);
    expect(result.tail).toContain("最后一行带着 <redacted>");
    expect(result.tail).not.toContain("s3cr3t-token");
    expect(result.tail).not.toContain("行20\n");
  });
});
