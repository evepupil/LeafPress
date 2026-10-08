import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildProgram, formatCommandError, main } from "../../src/cli/main.js";
import { LeafPressError } from "../../src/shared/errors.js";

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

describe("CLI 入口", () => {
  it("登记规格中的顶层命令和 work 子命令", () => {
    const program = buildProgram();
    expect(program.commands.map((command) => command.name())).toEqual([
      "init",
      "doctor",
      "serve",
      "works",
      "work",
      "convert",
      "ideas",
      "accounts",
      "account",
      "data",
      "export",
      "skill",
    ]);
    const work = program.commands.find((command) => command.name() === "work");
    expect(work?.commands.map((command) => command.name())).toEqual([
      "show",
      "next",
      "start",
      "step",
      "run",
      "back",
      "release",
      "feedback",
      "new",
    ]);
  });

  it("--version 不创建上下文，且只动态加载命令实现", async () => {
    const previous = process.exitCode;
    const createContext = vi.fn(() => {
      throw new Error("不该建上下文");
    });
    const output = await capture(() => main(["--version"], { createContext }));
    expect(output.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(output.stderr).toBe("");
    expect(createContext).not.toHaveBeenCalled();
    process.exitCode = previous;

    const source = readFileSync(
      fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(
      /import\s+.*(?:zod|node:sqlite|hono|usecases|store)/,
    );
    expect(source).toContain('import("./commands/');
  });

  it("翻译参数错误并保持正确退出码和 JSON 外壳", async () => {
    const previous = process.exitCode;
    const output = await capture(() => main(["--json", "work", "back", "x"]));
    const parsed = JSON.parse(output.stdout) as unknown;
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: "USAGE" },
    });
    expect(JSON.stringify(parsed)).toContain("缺少必需选项");
    expect(output.stderr).toBe("");
    expect(process.exitCode).toBe(2);

    const formatted = formatCommandError(
      new LeafPressError("STORE_FAILED", "记录库失败", { hint: "检查目录" }),
      false,
    );
    expect(formatted).toEqual({
      text: "错误：记录库失败\n提示：检查目录",
      stream: "stderr",
      exitCode: 1,
    });
    process.exitCode = previous;
  });

  it("根帮助列出命令且没有命令时返回用法错误", () => {
    const program = buildProgram();
    expect(program.helpInformation()).toContain("skill");
    const previous = process.exitCode;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url)),
        "--help",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("work");
    expect(result.stdout).toContain("serve");
    expect(process.exitCode).toBe(previous);
  });

  it("未知命令是具体的用法错误", async () => {
    const previous = process.exitCode;
    const output = await capture(() => main(["--json", "run"]));
    expect(JSON.parse(output.stdout)).toMatchObject({
      ok: false,
      error: { code: "USAGE", message: "命令行参数不正确：未知命令 run。" },
    });
    expect(process.exitCode).toBe(2);
    process.exitCode = previous;
  });
});
