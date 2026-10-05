import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { LeafPressError } from "../../src/shared/errors.js";
import { execCommand } from "../../src/shared/exec.js";

/** 在 Windows / POSIX 上都可用的命令：node 用 -e 跑一小段脚本 */
function nodeArgs(script: string): string[] {
  return ["-e", script];
}

describe("execCommand", () => {
  it("正常命令：返回退出码 0 和 stdout", async () => {
    const result = await execCommand(
      process.execPath,
      nodeArgs("process.stdout.write('你好 stdout')"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe("你好 stdout");
    expect(result.stderr).toBe("");
  });

  it("非零退出码：正常返回，不抛错", async () => {
    const result = await execCommand(
      process.execPath,
      nodeArgs(
        "process.stderr.write('坏了'); process.stdout.write('部分输出'); process.exit(3)",
      ),
    );
    expect(result.exitCode).toBe(3);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe("部分输出");
    expect(result.stderr).toBe("坏了");
  });

  it("超时：返回 timedOut 为 true、退出码 -1", async () => {
    const result = await execCommand(
      process.execPath,
      nodeArgs("setInterval(() => {}, 1000)"),
      { timeoutMs: 300 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  }, 10_000);

  it("命令不存在：抛 EXTERNAL_TOOL_MISSING，message 提到命令名", async () => {
    const promise = execCommand("leafpress-definitely-not-a-command", []);
    await expect(promise).rejects.toMatchObject({
      name: "LeafPressError",
      code: "EXTERNAL_TOOL_MISSING",
    });
    const error: LeafPressError = await promise.then(
      () => {
        throw new Error("应该抛错但没有抛");
      },
      (e: LeafPressError) => e,
    );
    expect(error.message).toContain("leafpress-definitely-not-a-command");
    expect(error.hint).toBeTruthy();
  });

  it("cwd 指向临时目录时命令在该目录下执行", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leafpress-exec-"));
    try {
      await writeFile(join(dir, "marker.txt"), "ok", "utf8");
      const result = await execCommand(
        process.execPath,
        nodeArgs(
          "const fs = require('fs'); process.stdout.write(fs.readFileSync('marker.txt','utf8'))",
        ),
        { cwd: dir },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("ok");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("env 里的自定义变量能传给子进程", async () => {
    const result = await execCommand(
      process.execPath,
      nodeArgs("process.stdout.write(process.env.LEAFPRESS_TEST ?? '')"),
      { env: { ...process.env, LEAFPRESS_TEST: "こんにちは" } },
    );
    expect(result.stdout).toBe("こんにちは");
  });

  it("cwd 不存在：抛 USAGE「工作目录不存在」，而不是误报找不到命令", async () => {
    const missing = join(
      tmpdir(),
      `leafpress-no-such-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const promise = execCommand(process.execPath, nodeArgs(""), {
      cwd: missing,
    });
    await expect(promise).rejects.toMatchObject({
      name: "LeafPressError",
      code: "USAGE",
    });
    const error: LeafPressError = await promise.then(
      () => {
        throw new Error("应该抛错但没有抛");
      },
      (e: LeafPressError) => e,
    );
    expect(error.message).toContain("工作目录不存在");
    expect(error.message).toContain(missing);
  });

  it("输出超过 16MB：抛 INTERNAL「命令输出超过 16MB」", async () => {
    // 一次性写约 17MB 到 stdout
    const promise = execCommand(
      process.execPath,
      nodeArgs(
        "const chunk = 'x'.repeat(1024 * 1024); for (let i = 0; i < 17; i++) process.stdout.write(chunk);",
      ),
    );
    await expect(promise).rejects.toMatchObject({
      name: "LeafPressError",
      code: "INTERNAL",
    });
    const error: LeafPressError = await promise.then(
      () => {
        throw new Error("应该抛错但没有抛");
      },
      (e: LeafPressError) => e,
    );
    expect(error.message).toContain("16MB");
  }, 20_000);
});
