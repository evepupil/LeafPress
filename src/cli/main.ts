#!/usr/bin/env node
/** LeafPress 命令行入口：注册命令、处理统一错误和进程退出码。 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";

import { createCliContext } from "./context.js";
import type { CliContext, CliGlobalOptions } from "./context.js";
import { register as registerInit } from "./commands/init.js";
import { register as registerDoctor } from "./commands/doctor.js";
import { register as registerPosts } from "./commands/posts.js";
import { register as registerRun } from "./commands/run.js";
import { isLeafPressError, LeafPressError } from "../shared/errors.js";
import type { ErrorCode } from "../shared/errors.js";
import { renderError } from "./output.js";

interface PackageInfo {
  readonly version: string;
}

const require = createRequire(import.meta.url);
const packageInfo = require("../../package.json") as PackageInfo;

export function isMainModule(
  mainFlag: boolean | undefined,
  entryPath: string | undefined,
): boolean {
  if (mainFlag !== undefined) return mainFlag;
  if (entryPath === undefined) return false;
  try {
    return (
      realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

export interface BuildProgramOptions {
  readonly createContext?: (options: CliGlobalOptions) => CliContext;
}

export interface CommandErrorOutput {
  readonly text: string;
  readonly stream: "stdout" | "stderr";
  readonly exitCode: 1 | 2;
  readonly stack?: string;
}

export function formatCommandError(
  error: unknown,
  json: boolean,
  debug = false,
): CommandErrorOutput {
  if (isLeafPressError(error)) {
    return {
      text: renderError(error, json),
      stream: json ? "stdout" : "stderr",
      exitCode: error.code === "USAGE" ? 2 : 1,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = {
    code: "INTERNAL" as ErrorCode,
    message: `内部错误：${message}`,
    hint: "设置环境变量 LEAFPRESS_DEBUG=1 可以看到详细信息。",
  };
  return {
    text: renderError(normalized, json),
    stream: json ? "stdout" : "stderr",
    exitCode: 1,
    ...(debug && error instanceof Error && error.stack !== undefined
      ? { stack: error.stack }
      : {}),
  };
}

export function buildProgram(options: BuildProgramOptions = {}): Command {
  let context: CliContext | undefined;
  const program = new Command();
  program
    .name("leafpress")
    .description("个人内容工作台命令行")
    .version(packageInfo.version)
    .option("--home <目录>", "LeafPress 数据目录")
    .option("--json", "以 JSON 输出")
    .configureOutput({ outputError: () => {} })
    .exitOverride();

  const getContext = (): CliContext => {
    if (context === undefined) {
      const parsed = program.opts<{ home?: string; json?: boolean }>();
      context = (options.createContext ?? createCliContext)({
        ...(parsed.home === undefined ? {} : { home: parsed.home }),
        ...(parsed.json === undefined ? {} : { json: parsed.json }),
      });
    }
    return context;
  };

  registerInit(program, getContext);
  registerDoctor(program, getContext);
  registerPosts(program, getContext);
  registerRun(program, getContext);
  return program;
}

function commanderUsageMessage(error: CommanderError): string {
  const detail = error.message.replace(/^error:\s*/i, "");
  if (error.code === "commander.unknownOption") {
    const option = /unknown option ['"]([^'"]+)['"]/i.exec(detail)?.[1];
    if (option !== undefined) return `命令行参数不正确：未知选项 ${option}。`;
  }
  if (error.code === "commander.missingArgument") {
    const argument = /missing required argument ['"]([^'"]+)['"]/i.exec(
      detail,
    )?.[1];
    if (argument === "runId") {
      return "命令行参数不正确：缺少运行编号（runId）。";
    }
    if (argument !== undefined) {
      return `命令行参数不正确：缺少必需参数 ${argument}。`;
    }
  }
  if (error.code === "commander.optionMissingArgument") {
    const option = /option ['"](--[a-z0-9-]+)/i.exec(detail)?.[1];
    if (option !== undefined) {
      return `命令行参数不正确：选项 ${option} 缺少参数。`;
    }
  }
  if (error.code === "commander.unknownCommand") {
    const command = /unknown command ['"]([^'"]+)['"]/i.exec(detail)?.[1];
    if (command !== undefined) return `命令行参数不正确：未知命令 ${command}。`;
  }
  if (error.code === "commander.excessArguments") {
    const command = /too many arguments for ['"]([^'"]+)['"]/i.exec(
      detail,
    )?.[1];
    const argumentsList = /got \d+: (.+)\.$/i.exec(detail)?.[1];
    const suffix =
      argumentsList === undefined
        ? ""
        : `：${argumentsList.split(/,\s*/).join("、")}`;
    return command === undefined
      ? `命令行参数不正确：存在多余参数${suffix}。`
      : `命令「${command}」不接受多余参数${suffix}。`;
  }
  return `命令行参数不正确：${detail}`;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  options: BuildProgramOptions = {},
): Promise<void> {
  let context: CliContext | undefined;
  const program = buildProgram({
    createContext: (globalOptions) => {
      context ??= (options.createContext ?? createCliContext)(globalOptions);
      return context;
    },
  });
  try {
    await program.parseAsync([...argv], { from: "user" });
    if (context !== undefined) process.exitCode = context.exitCode;
  } catch (error) {
    if (error instanceof CommanderError && error.code === "commander.help") {
      const message = "请指定要运行的命令。";
      const parsed = program.opts<{ json?: boolean }>();
      if (parsed.json === true) {
        const output = formatCommandError(
          new LeafPressError("USAGE", message),
          true,
        );
        process.stdout.write(`${output.text}\n`);
      } else {
        process.stderr.write(`${message}\n`);
      }
      process.exitCode = 2;
      return;
    }
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const parsed = program.opts<{ json?: boolean }>();
    const isUsage = error instanceof CommanderError;
    const normalizedError = isUsage
      ? new LeafPressError("USAGE", commanderUsageMessage(error), {
          hint: "运行 leafpress --help 查看用法。",
        })
      : error;
    const output = formatCommandError(
      normalizedError,
      parsed.json === true,
      process.env["LEAFPRESS_DEBUG"] === "1",
    );
    const stream = output.stream === "stdout" ? process.stdout : process.stderr;
    stream.write(`${output.text}\n`);
    if (output.stack !== undefined) process.stderr.write(`${output.stack}\n`);
    process.exitCode = isUsage ? 2 : output.exitCode;
  } finally {
    context?.close();
  }
}

if (isMainModule(import.meta.main, process.argv[1])) {
  void main();
}
