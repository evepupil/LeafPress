/**
 * 博客步骤测试用的假 pnpm：可以控制成功、失败、超时，也能假装 PATH 里没有 pnpm。
 * steps-fixtures.ts 会把这里的东西原样再导出，测试从那边导入就行。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ExecOptions, ExecResult } from "../../../src/shared/exec.js";

/** 假 prettier 的排版结果：去掉行尾空格、统一换行、结尾只留一个换行 */
export function formatted(text: string): string {
  return `${text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "")}\n`;
}

// ---------------------------------------------------------------------------
// 假的 pnpm

export interface PnpmCall {
  /** 脚本名：install、content:check、format:check、build、prettier */
  script: string;
  args: string[];
  cwd: string;
  timeoutMs: number | undefined;
  killTree: boolean | undefined;
}

export type PnpmHandler = (call: PnpmCall) => ExecResult | Promise<ExecResult>;

export function ok(stdout = ""): ExecResult {
  return { stdout, stderr: "", exitCode: 0, timedOut: false };
}

export function failure(stdout = "", exitCode = 1): ExecResult {
  return { stdout, stderr: "", exitCode, timedOut: false };
}

export function timeout(): ExecResult {
  return { stdout: "", stderr: "", exitCode: -1, timedOut: true };
}

/** 从 pnpm 调用里认出 pnpm 参数：Windows 上是 cmd.exe /d /s /c pnpm …，别处是 pnpm … */
export function pnpmArguments(
  command: string,
  args: readonly string[],
): string[] | undefined {
  if (command === "pnpm") return [...args];
  if (
    command === "cmd.exe" &&
    args[0] === "/d" &&
    args[1] === "/s" &&
    args[2] === "/c" &&
    args[3] === "pnpm"
  )
    return args.slice(4);
  return undefined;
}

/**
 * 认出 runPnpm 第一次用之前探测「pnpm 在不在」的那条命令（Windows 上是 cmd.exe /d /s /c "where pnpm"）。
 * 它不算 pnpm 调用，假 pnpm 单独应答，免得测试里真的去查本机的 PATH。
 */
export function isPnpmProbe(command: string, args: readonly string[]): boolean {
  return (
    command === "cmd.exe" &&
    args.length === 4 &&
    args[0] === "/d" &&
    args[1] === "/s" &&
    args[2] === "/c" &&
    args[3] === "where pnpm"
  );
}

export class FakePnpm {
  readonly calls: PnpmCall[] = [];
  /** 收到过几次「pnpm 在不在」的探测 */
  probes = 0;
  /** 设成 true：探测说 PATH 里没有 pnpm */
  missing = false;
  private readonly handlers = new Map<string, PnpmHandler>();

  constructor() {
    this.on("install", async ({ cwd }) => {
      await mkdir(join(cwd, "node_modules", ".fake"), { recursive: true });
      return ok("installed");
    });
    this.on("prettier", async ({ args, cwd }) => {
      for (const path of args.filter((arg) => arg.endsWith(".mdx"))) {
        const file = join(cwd, path);
        await writeFile(file, formatted(await readFile(file, "utf8")), "utf8");
      }
      return ok("formatted");
    });
  }

  /** 换掉某个脚本的行为 */
  on(script: string, handler: PnpmHandler): void {
    this.handlers.set(script, handler);
  }

  /** 应答 where pnpm：找到退出码 0，找不到退出码 1（和真的 where 一样） */
  probe(): ExecResult {
    this.probes += 1;
    return this.missing
      ? failure("信息: 用提供的模式无法找到文件。", 1)
      : ok("C:\\fake\\npm\\pnpm.cmd");
  }

  /** 让某个脚本失败，输出给定内容 */
  fail(script: string, stdout = "出错了", exitCode = 1): void {
    this.on(script, () => failure(stdout, exitCode));
  }

  callsOf(script: string): PnpmCall[] {
    return this.calls.filter((call) => call.script === script);
  }

  async run(
    args: string[],
    cwd: string,
    options?: ExecOptions,
  ): Promise<ExecResult> {
    const script = args[0] === "exec" ? (args[1] ?? "exec") : (args[0] ?? "");
    const call: PnpmCall = {
      script,
      args,
      cwd,
      timeoutMs: options?.timeoutMs,
      killTree: options?.killTree,
    };
    this.calls.push(call);
    const handler = this.handlers.get(script);
    return handler ? handler(call) : ok(`${script} ok`);
  }
}
