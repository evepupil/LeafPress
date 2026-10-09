import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

/** 进程还活着吗（权限不够也算活着） */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitUntilDead(pid: number, withinMs: number): Promise<boolean> {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isAlive(pid);
}

async function readPid(file: string): Promise<number> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number(await readFile(file, "utf8"));
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {
      // 文件还没写出来
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("等不到子孙进程写下进程号");
}

describe("execCommand 的 killTree 选项", () => {
  it.each([false, true])(
    "killTree=%s：退出码、输出的表现和普通路径一致",
    async (killTree) => {
      const success = await execCommand(
        process.execPath,
        nodeArgs("process.stdout.write('好'); process.stderr.write('警告')"),
        { killTree },
      );
      expect(success).toEqual({
        stdout: "好",
        stderr: "警告",
        exitCode: 0,
        timedOut: false,
      });

      const failed = await execCommand(
        process.execPath,
        nodeArgs("process.stdout.write('部分'); process.exit(3)"),
        { killTree },
      );
      expect(failed).toEqual({
        stdout: "部分",
        stderr: "",
        exitCode: 3,
        timedOut: false,
      });
    },
  );

  it("killTree：cwd 和 env 照样生效", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leafpress-exec-tree-"));
    try {
      const result = await execCommand(
        process.execPath,
        nodeArgs(
          "process.stdout.write(process.cwd() + '|' + (process.env.LEAFPRESS_TREE ?? ''))",
        ),
        {
          cwd: dir,
          env: { ...process.env, LEAFPRESS_TREE: "树" },
          killTree: true,
        },
      );
      expect(result.exitCode).toBe(0);
      const [cwd, value] = result.stdout.split("|");
      expect(realpathSync.native(cwd ?? "")).toBe(realpathSync.native(dir));
      expect(value).toBe("树");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("killTree：标准输入不留管道，读输入的命令直接得到结束而不是傻等", async () => {
    const result = await execCommand(
      process.execPath,
      nodeArgs(
        "let n = 0; process.stdin.on('data', (c) => { n += c.length; }); process.stdin.on('end', () => process.stdout.write('读到' + n));",
      ),
      { killTree: true, timeoutMs: 10_000 },
    );
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe("读到0");
  }, 20_000);

  it("killTree：命令找不到仍抛 EXTERNAL_TOOL_MISSING，cwd 不存在仍抛 USAGE", async () => {
    await expect(
      execCommand("leafpress-definitely-not-a-command", [], {
        killTree: true,
      }),
    ).rejects.toMatchObject({
      name: "LeafPressError",
      code: "EXTERNAL_TOOL_MISSING",
    });

    const missing = join(tmpdir(), `leafpress-no-such-dir-${Date.now()}`);
    await expect(
      execCommand(process.execPath, nodeArgs(""), {
        cwd: missing,
        killTree: true,
      }),
    ).rejects.toMatchObject({ name: "LeafPressError", code: "USAGE" });
  });

  it("killTree：输出超过 16MB 仍抛 INTERNAL", async () => {
    await expect(
      execCommand(
        process.execPath,
        nodeArgs(
          "const chunk = 'x'.repeat(1024 * 1024); for (let i = 0; i < 17; i++) process.stdout.write(chunk); setInterval(() => {}, 1000);",
        ),
        { killTree: true, timeoutMs: 60_000 },
      ),
    ).rejects.toMatchObject({ name: "LeafPressError", code: "INTERNAL" });
  }, 70_000);

  it("killTree 超时：返回 timedOut，连不是 Node 起的子孙进程一起结束", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leafpress-exec-tree-"));
    const pidFile = join(dir, "grandchild.pid");
    // 中间隔一层脚本外壳（Windows 的 cmd.exe、别处的 sh），和 cmd.exe /c pnpm build 一个结构：
    // 外壳 → node（孙进程，记下自己的进程号后一直挂着）。
    // 只杀外壳的话，孙进程不会跟着死（Node 只会带走自己起的子进程）
    const grandchildScript = join(dir, "grandchild.js");
    await writeFile(
      grandchildScript,
      "require('node:fs').writeFileSync(process.argv[2], String(process.pid)); setInterval(() => {}, 1000);",
      "utf8",
    );
    const shell =
      process.platform === "win32"
        ? {
            file: join(dir, "run.cmd"),
            text: `@"${process.execPath}" "${grandchildScript}" "${pidFile}"\r\n`,
            command: "cmd.exe",
            args: ["/d", "/s", "/c"],
          }
        : {
            file: join(dir, "run.sh"),
            text: `"${process.execPath}" "${grandchildScript}" "${pidFile}"\necho done\n`,
            command: "sh",
            args: [],
          };
    await writeFile(shell.file, shell.text, "utf8");
    let grandchild: number | undefined;
    try {
      const result = await execCommand(
        shell.command,
        [...shell.args, shell.file],
        { killTree: true, timeoutMs: 4_000 },
      );
      grandchild = await readPid(pidFile);

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(-1);
      expect(await waitUntilDead(grandchild, 10_000)).toBe(true);
    } finally {
      if (grandchild !== undefined && isAlive(grandchild)) {
        process.kill(grandchild, "SIGKILL");
      }
      await rm(dir, { recursive: true, force: true });
    }
  }, 40_000);

  it("killTree 超时：有漏网的孙进程占着输出管道也不会一直等", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leafpress-exec-tree-"));
    const pidFile = join(dir, "orphan.pid");
    // 父进程起一个脱离的孙进程（继承输出管道）后立刻退出：进程树已经断了，杀不到它
    const script = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] });",
      "fs.writeFileSync(process.argv[1], String(child.pid));",
      "child.unref();",
    ].join("\n");
    let orphan: number | undefined;
    try {
      const started = Date.now();
      const result = await execCommand(
        process.execPath,
        ["-e", script, pidFile],
        { killTree: true, timeoutMs: 1_500 },
      );
      orphan = await readPid(pidFile);

      expect(result.timedOut).toBe(true);
      // 要等到超时才返回（孙进程占着输出管道，进程一直没有收尾），
      // 超时 1.5 秒 + 最多再等 2 秒后放手，远小于孙进程自己结束的时间（永远不会）
      const waited = Date.now() - started;
      expect(waited).toBeGreaterThanOrEqual(1_400);
      expect(waited).toBeLessThan(15_000);
    } finally {
      if (orphan !== undefined && isAlive(orphan)) {
        process.kill(orphan, "SIGKILL");
      }
      await rm(dir, { recursive: true, force: true });
    }
  }, 40_000);
});
