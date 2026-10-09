import { describe, expect, it } from "vitest";

import {
  PnpmNotFoundError,
  ensurePnpmAvailable,
  pnpmInvocation,
  runPnpm,
} from "../../../src/platforms/blog/pnpm.js";
import type {
  ExecFn,
  ExecOptions,
  ExecResult,
} from "../../../src/shared/exec.js";
import { failure, ok, timeout } from "./steps-fixtures.js";

describe("pnpmInvocation", () => {
  it("Windows 上借 cmd.exe 起 pnpm，避免直接起 .cmd 报 spawn EINVAL", () => {
    expect(
      pnpmInvocation("win32", ["exec", "prettier", "--write", "a.mdx"]),
    ).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm", "exec", "prettier", "--write", "a.mdx"],
    });
  });

  it("别的系统直接起 pnpm", () => {
    expect(pnpmInvocation("linux", ["build"])).toEqual({
      command: "pnpm",
      args: ["build"],
    });
    expect(pnpmInvocation("darwin", ["install"])).toEqual({
      command: "pnpm",
      args: ["install"],
    });
  });
});

describe("runPnpm", () => {
  it("带工作目录、超时，并要求超时连子进程一起结束", async () => {
    let seen: {
      command: string;
      args: readonly string[];
      options?: ExecOptions;
    } = { command: "", args: [] };
    const result = await runPnpm(
      (command, args, options) => {
        seen = { command, args, ...(options ? { options } : {}) };
        return Promise.resolve(ok("好了"));
      },
      "/some/dir",
      ["content:check"],
      120_000,
    );

    expect(result.stdout).toBe("好了");
    expect(seen.options).toEqual({
      cwd: "/some/dir",
      timeoutMs: 120_000,
      killTree: true,
    });
    expect(seen.args.at(-1)).toBe("content:check");
    expect(
      seen.command === "pnpm" ||
        (seen.command === "cmd.exe" &&
          seen.args.slice(0, 4).join(" ") === "/d /s /c pnpm"),
    ).toBe(true);
  });

  it.runIf(process.platform === "win32")(
    "Windows 上 PATH 里没有 pnpm：直接抛「找不到 pnpm」，真正的 pnpm 命令一条都没起",
    async () => {
      const calls: string[][] = [];
      const exec: ExecFn = (command, args) => {
        calls.push([command, ...args]);
        return Promise.resolve(failure("", 1));
      };

      await expect(runPnpm(exec, "/some/dir", ["build"], 1000)).rejects.toThrow(
        PnpmNotFoundError,
      );

      expect(calls).toEqual([["cmd.exe", "/d", "/s", "/c", "where pnpm"]]);
    },
  );
});

/** 假的执行函数：按顺序给探测结果（可以是结果或抛错），记下每次调用 */
function probeExec(...replies: (ExecResult | Error)[]) {
  const calls: string[][] = [];
  const exec: ExecFn = (command, args) => {
    calls.push([command, ...args]);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply === undefined) return Promise.reject(new Error("没有预设的回应"));
    return reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve(reply);
  };
  return { exec, calls };
}

describe("ensurePnpmAvailable：第一次用之前探测 pnpm 在不在", () => {
  it('探测命令是 cmd.exe /d /s /c "where pnpm"；找到（退出码 0）就放行', async () => {
    const { exec, calls } = probeExec(ok("C:\\npm\\pnpm.cmd"));

    await expect(ensurePnpmAvailable(exec, "win32")).resolves.toBeUndefined();

    expect(calls).toEqual([["cmd.exe", "/d", "/s", "/c", "where pnpm"]]);
  });

  it("没找到（退出码 1）：抛 PnpmNotFoundError，文字说清是运行环境的 PATH 没有 pnpm", async () => {
    const { exec } = probeExec(failure("", 1));

    const error: unknown = await ensurePnpmAvailable(exec, "win32").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PnpmNotFoundError);
    expect((error as Error).message).toBe(
      "找不到 pnpm：运行 LeafPress 的环境里 PATH 没有 pnpm",
    );
  });

  it("找到之后在本进程里记住：同一个执行函数不再探测", async () => {
    const { exec, calls } = probeExec(ok());

    await ensurePnpmAvailable(exec, "win32");
    await ensurePnpmAvailable(exec, "win32");
    await ensurePnpmAvailable(exec, "win32");

    expect(calls).toHaveLength(1);
  });

  it("换一个执行函数（比如测试里换了假的）就重新探测，不互相串", async () => {
    const first = probeExec(ok());
    const second = probeExec(failure("", 1));

    await ensurePnpmAvailable(first.exec, "win32");

    await expect(ensurePnpmAvailable(second.exec, "win32")).rejects.toThrow(
      PnpmNotFoundError,
    );
    expect(second.calls).toHaveLength(1);
  });

  it("没找到不记：用户补装 pnpm 之后不用重启服务就能好", async () => {
    const { exec, calls } = probeExec(failure("", 1), ok());

    await expect(ensurePnpmAvailable(exec, "win32")).rejects.toThrow(
      PnpmNotFoundError,
    );
    await expect(ensurePnpmAvailable(exec, "win32")).resolves.toBeUndefined();

    expect(calls).toHaveLength(2);
  });

  it.each([
    ["超时", timeout()],
    ["where 自己出了问题（退出码 9009）", failure("", 9009)],
    ["探测命令起不来（执行函数抛错）", new Error("找不到命令 cmd.exe")],
  ])(
    "探测本身没跑成（%s）：不下「没有 pnpm」的结论，也不记住",
    async (_name, reply) => {
      const { exec, calls } = probeExec(reply);

      await expect(ensurePnpmAvailable(exec, "win32")).resolves.toBeUndefined();
      await ensurePnpmAvailable(exec, "win32");

      expect(calls).toHaveLength(2);
    },
  );

  it("不是 Windows：不探测（直接起 pnpm，找不到时执行函数自己会报）", async () => {
    const { exec, calls } = probeExec(failure("", 1));

    await expect(ensurePnpmAvailable(exec, "linux")).resolves.toBeUndefined();

    expect(calls).toEqual([]);
  });
});
