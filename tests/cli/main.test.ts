import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createCliContext } from "../../src/cli/context.js";
import {
  buildProgram,
  formatCommandError,
  isMainModule,
  main,
} from "../../src/cli/main.js";
import { LeafPressError } from "../../src/shared/errors.js";
import { execCommand } from "../../src/shared/exec.js";

async function makeBlogRepo(repoPath: string): Promise<void> {
  await mkdir(join(repoPath, "content", "posts", "zh"), { recursive: true });
  await writeFile(
    join(repoPath, "content", "posts", "zh", "first.md"),
    "---\ntitle: 第一篇\npublished: 2026-01-01\nlocale: zh-CN\n---\n\n正文。\n",
    "utf8",
  );
  await execCommand("git", ["init", "-b", "main"], { cwd: repoPath });
  await execCommand("git", ["add", "."], { cwd: repoPath });
  await execCommand(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "initial",
    ],
    { cwd: repoPath },
  );
}

async function captureStreams<T>(run: () => Promise<T>): Promise<{
  result: T;
  stdout: string;
  stderr: string;
}> {
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
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
    return { result: await run(), stdout, stderr };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
}

function runCli(args: readonly string[]) {
  const projectPath = fileURLToPath(new URL("../../", import.meta.url));
  return spawnSync(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      join(projectPath, "src", "cli", "main.ts"),
      ...args,
    ],
    { cwd: projectPath, encoding: "utf8" },
  );
}

describe("CLI 入口和错误输出", () => {
  it("注册全局选项与规格内的命令", () => {
    const program = buildProgram();
    expect(program.name()).toBe("leafpress");
    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      "doctor",
      "init",
      "posts",
      "run",
    ]);
    expect(
      program.commands
        .find((command) => command.name() === "run")
        ?.commands.map((command) => command.name()),
    ).toEqual(["list", "show", "cancel"]);
  });

  it("LeafPressError 和普通异常按人类可读格式输出并给出退出码", () => {
    const usage = formatCommandError(
      new LeafPressError("USAGE", "参数不正确", { hint: "请检查参数" }),
      false,
    );
    expect(usage).toEqual({
      text: "错误：参数不正确\n提示：请检查参数",
      stream: "stderr",
      exitCode: 2,
    });

    const internal = formatCommandError(new Error("unexpected"), false);
    expect(internal.text).toContain("错误：内部错误：unexpected");
    expect(internal.text).toContain("提示：设置环境变量 LEAFPRESS_DEBUG=1");
    expect(internal.exitCode).toBe(1);
    expect(internal.stream).toBe("stderr");
    expect(
      formatCommandError(new Error("failure"), false, true).stack,
    ).toContain("Error: failure");
  });

  it("LeafPressError 和普通异常按 JSON 输出到 stdout", () => {
    const leafPress = formatCommandError(
      new LeafPressError("STORE_FAILED", "记录库读取失败", {
        hint: "检查文件",
      }),
      true,
    );
    expect(leafPress.stream).toBe("stdout");
    expect(leafPress.exitCode).toBe(1);
    expect(JSON.parse(leafPress.text)).toEqual({
      ok: false,
      error: {
        code: "STORE_FAILED",
        message: "记录库读取失败",
        hint: "检查文件",
      },
    });

    const internal = formatCommandError(new Error("broken"), true);
    expect(internal.stream).toBe("stdout");
    expect(JSON.parse(internal.text)).toMatchObject({
      ok: false,
      error: { code: "INTERNAL", message: "内部错误：broken" },
    });
  });

  it("main 将 init 用法错误转成 JSON 并返回退出码 2", async () => {
    const home = await mkdtemp(join(tmpdir(), "leafpress-cli-main-"));
    const previousExitCode = process.exitCode;
    try {
      const captured = await captureStreams(() =>
        main(["--home", join(home, "data"), "--json", "init"]),
      );
      expect(captured.stdout).toContain('"code": "USAGE"');
      expect(captured.stdout).toContain("首次初始化必须指定博客仓库路径");
      expect(captured.stderr).toBe("");
      expect(process.exitCode).toBe(2);
    } finally {
      process.exitCode = previousExitCode;
      await rm(home, { recursive: true, force: true });
    }
  });

  it("Commander 用法错误保留未知选项、缺少参数和值的具体原因", async () => {
    const previousExitCode = process.exitCode;
    const cases = [
      { argv: ["--json", "--limt"], reason: "未知选项 --limt" },
      {
        argv: ["--json", "run", "show"],
        reason: "缺少运行编号（runId）",
      },
      { argv: ["--json", "--home"], reason: "选项 --home 缺少参数" },
    ];
    try {
      for (const { argv, reason } of cases) {
        const captured = await captureStreams(() => main(argv));
        expect(captured.stdout).toContain(reason);
        expect(captured.stderr).toBe("");
        expect(process.exitCode).toBe(2);
        process.exitCode = previousExitCode;
      }
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("没有提供子命令时不泄露 Commander 占位词", () => {
    for (const args of [[], ["run"]]) {
      const result = runCli(args);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Usage:");
      expect(result.stderr.trim().split("\n").at(-1)).toBe(
        "请指定要运行的命令。",
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain("(outputHelp)");
    }

    const jsonResult = runCli(["--json"]);
    expect(jsonResult.error).toBeUndefined();
    expect(jsonResult.status).toBe(2);
    expect(jsonResult.stderr).toContain("Usage:");
    expect(jsonResult.stderr).not.toContain("请指定要运行的命令。");
    expect(JSON.parse(jsonResult.stdout)).toMatchObject({
      ok: false,
      error: { code: "USAGE", message: "请指定要运行的命令。" },
    });
    expect(`${jsonResult.stdout}${jsonResult.stderr}`).not.toContain(
      "(outputHelp)",
    );
  }, 15000);

  it("多传参数时将 Commander 英文原因翻译成中文", () => {
    const result = runCli(["doctor", "extra", "one"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "命令「doctor」不接受多余参数：extra、one。",
    );
    expect(result.stderr).not.toContain("too many arguments");
  });

  it("doctor 错误会设置退出码 1 且只使用注入的临时目录", async () => {
    const temp = await mkdtemp(join(tmpdir(), "leafpress-cli-main-doctor-"));
    const previousExitCode = process.exitCode;
    const home = join(temp, "data");
    try {
      const captured = await captureStreams(() =>
        main(["--home", home, "--json", "doctor"], {
          createContext: (options) =>
            createCliContext(options, {
              env: {},
              homedir: temp,
              edgeLocator: () => undefined,
            }),
        }),
      );
      expect(JSON.parse(captured.stdout)).toMatchObject({ ok: false });
      expect(captured.stderr).toBe("");
      expect(process.exitCode).toBe(1);
      expect(existsSync(join(home, "leafpress.db"))).toBe(false);
    } finally {
      process.exitCode = previousExitCode;
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("关闭 debug 时内部错误不输出堆栈", async () => {
    const temp = await mkdtemp(join(tmpdir(), "leafpress-cli-main-debug-"));
    const previousExitCode = process.exitCode;
    const previousDebug = process.env["LEAFPRESS_DEBUG"];
    const context = createCliContext(
      { home: join(temp, "data") },
      { env: {}, homedir: temp, edgeLocator: () => undefined },
    );
    context.getConfig = () => Promise.reject(new Error("synthetic failure"));
    delete process.env["LEAFPRESS_DEBUG"];
    try {
      const captured = await captureStreams(() =>
        main(["--home", context.home, "posts"], {
          createContext: () => context,
        }),
      );
      expect(captured.stderr).toContain("内部错误：synthetic failure");
      expect(captured.stderr).not.toContain("Error: synthetic failure");
      expect(captured.stderr).not.toMatch(/^\s+at /m);
      expect(process.exitCode).toBe(1);
    } finally {
      if (previousDebug === undefined) delete process.env["LEAFPRESS_DEBUG"];
      else process.env["LEAFPRESS_DEBUG"] = previousDebug;
      process.exitCode = previousExitCode;
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("命令结束时关闭记录库，数据库文件可立即删除", async () => {
    const temp = await mkdtemp(join(tmpdir(), "leafpress-cli-main-close-"));
    const previousExitCode = process.exitCode;
    const home = join(temp, "data");
    const repoPath = join(temp, "blog");
    await mkdir(repoPath);
    await makeBlogRepo(repoPath);
    const dbFile = join(home, "leafpress.db");
    try {
      const captured = await captureStreams(() =>
        main(["--home", home, "init", "--blog", repoPath], {
          createContext: (options) =>
            createCliContext(options, {
              env: {},
              homedir: temp,
              edgeLocator: () => undefined,
            }),
        }),
      );
      expect(captured.stdout).toContain("初始化完成");
      expect(process.exitCode).toBe(0);
      expect(existsSync(dbFile)).toBe(true);
      await rm(dbFile);
      expect(existsSync(dbFile)).toBe(false);
    } finally {
      process.exitCode = previousExitCode;
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("Node 24.2 以前使用入口与模块的真实路径进行比较", async () => {
    const temp = await mkdtemp(join(tmpdir(), "leafpress-cli-main-fallback-"));
    const linkPath = join(temp, "project-link");
    const projectPath = fileURLToPath(new URL("../../", import.meta.url));
    await symlink(
      projectPath,
      linkPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    try {
      expect(
        isMainModule(undefined, join(linkPath, "src", "cli", "main.ts")),
      ).toBe(true);
      expect(isMainModule(undefined, undefined)).toBe(false);
      expect(isMainModule(false, join(linkPath, "src", "cli", "main.ts"))).toBe(
        false,
      );
      expect(isMainModule(true, undefined)).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("经项目目录联接直接启动时仍执行 --version", async () => {
    const temp = await mkdtemp(join(tmpdir(), "leafpress-cli-link-"));
    const linkPath = join(temp, "project-link");
    const projectPath = fileURLToPath(new URL("../../", import.meta.url));
    await symlink(
      projectPath,
      linkPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          join(linkPath, "src", "cli", "main.ts"),
          "--version",
        ],
        { cwd: linkPath, encoding: "utf8" },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("main 支持 --version 且不创建 CLI 上下文", async () => {
    const previousExitCode = process.exitCode;
    const createContext = vi.fn(() => {
      throw new Error("--version 不应创建 CLI 上下文");
    });
    try {
      const captured = await captureStreams(() =>
        main(["--version"], { createContext }),
      );
      expect(captured.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
      expect(captured.stderr).toBe("");
      expect(createContext).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
