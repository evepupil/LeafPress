#!/usr/bin/env node
/** LeafPress 命令行入口：只登记参数，并在对应命令执行时加载实现。 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import type { CliContext, CliGlobalOptions } from "./context.js";

interface PackageInfo {
  readonly version: string;
}

const require = createRequire(import.meta.url);
const packageInfo = require("../../package.json") as PackageInfo;

type Runner = {
  run(context: CliContext, args: readonly unknown[]): Promise<void>;
};
type ContextFactory = (
  options: CliGlobalOptions,
) => CliContext | Promise<CliContext>;

export interface BuildProgramOptions {
  readonly createContext?: ContextFactory;
}

export interface CommandErrorOutput {
  readonly text: string;
  readonly stream: "stdout" | "stderr";
  readonly exitCode: 1 | 2;
  readonly stack?: string;
}

function isStructuredError(value: unknown): value is {
  code: string;
  message: string;
  hint?: string;
} {
  if (typeof value !== "object" || value === null) return false;
  return (
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string" &&
    "name" in value &&
    value.name === "LeafPressError"
  );
}

function errorText(
  error: { code: string; message: string; hint?: string },
  json: boolean,
): string {
  if (json) {
    return JSON.stringify(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.hint === undefined ? {} : { hint: error.hint }),
        },
      },
      null,
      2,
    );
  }
  return [
    `错误：${error.message}`,
    ...(error.hint === undefined ? [] : [`提示：${error.hint}`]),
  ].join("\n");
}

export function formatCommandError(
  error: unknown,
  json: boolean,
  debug = false,
): CommandErrorOutput {
  if (isStructuredError(error)) {
    return {
      text: errorText(error, json),
      stream: json ? "stdout" : "stderr",
      exitCode: error.code === "USAGE" ? 2 : 1,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = {
    code: "INTERNAL",
    message: `内部错误：${message}`,
    hint: "设置环境变量 LEAFPRESS_DEBUG=1 可以看到详细信息。",
  };
  return {
    text: errorText(normalized, json),
    stream: json ? "stdout" : "stderr",
    exitCode: 1,
    ...(debug && error instanceof Error && error.stack !== undefined
      ? { stack: error.stack }
      : {}),
  };
}

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

function addAction(
  command: Command,
  load: () => Promise<Runner>,
  operation?: string,
  getContext?: () => Promise<CliContext>,
): void {
  command.action(async (...args: unknown[]) => {
    if (getContext === undefined) throw new Error("CLI 上下文工厂未初始化。");
    const runner = await load();
    await runner.run(
      await getContext(),
      operation === undefined ? args : [operation, ...args],
    );
  });
}

export function buildProgram(options: BuildProgramOptions = {}): Command {
  let contextPromise: Promise<CliContext> | undefined;
  const program = new Command();
  program
    .name("leafpress")
    .description("个人内容工作台命令行")
    .version(packageInfo.version)
    .option("--home <目录>", "LeafPress 数据目录")
    .option("--json", "以 JSON 输出")
    .configureOutput({ outputError: () => {} })
    .exitOverride();
  const getContext = (): Promise<CliContext> => {
    contextPromise ??= (async () => {
      const parsed = program.opts<{ home?: string; json?: boolean }>();
      const globalOptions = {
        ...(parsed.home === undefined ? {} : { home: parsed.home }),
        ...(parsed.json === undefined ? {} : { json: parsed.json }),
      };
      if (options.createContext !== undefined)
        return options.createContext(globalOptions);
      const { createCliContext } = await import("./context.js");
      return createCliContext(globalOptions);
    })();
    return contextPromise;
  };

  addAction(
    program.command("init").description("初始化数据目录、配置和记录库"),
    () => import("./commands/init.js"),
    undefined,
    getContext,
  );
  addAction(
    program.command("doctor").description("检查 LeafPress 运行环境"),
    () => import("./commands/doctor.js"),
    undefined,
    getContext,
  );

  const serve = program.command("serve").description("启动本机工作台");
  serve
    .option("--port <端口>", "监听端口")
    .option("--open", "启动后打开浏览器")
    .option("--dev", "使用开发模式");
  addAction(serve, () => import("./commands/serve.js"), undefined, getContext);

  const works = program.command("works").description("列出作品");
  works
    .option("--status <状态,…>", "按状态筛选")
    .option("--account <账号>", "按账号筛选");
  addAction(works, () => import("./commands/works.js"), undefined, getContext);

  const work = program.command("work").description("查看和推进作品");
  addAction(
    work.command("show <作品>").description("查看作品说明"),
    () => import("./commands/work.js"),
    "show",
    getContext,
  );
  const next = work
    .command("next")
    .description("接手待实现作品")
    .option("--account <账号>", "限定账号");
  addAction(next, () => import("./commands/work.js"), "next", getContext);
  const start = work
    .command("start <作品>")
    .description("接手指定作品")
    .option("--force", "接管现有租约");
  addAction(start, () => import("./commands/work.js"), "start", getContext);
  const step = work
    .command("step <作品>")
    .description("完成当前 AI 步骤")
    .requiredOption("--lease <令牌>", "接手时返回的令牌")
    .option("--force", "跳过产出文件检查");
  addAction(step, () => import("./commands/work-agent.js"), "step", getContext);
  const run = work
    .command("run <作品>")
    .description("执行当前自动步骤")
    .requiredOption("--lease <令牌>", "接手时返回的令牌");
  addAction(run, () => import("./commands/work-agent.js"), "run", getContext);
  const back = work
    .command("back <作品> <第几步>")
    .description("退回指定步骤重做")
    .requiredOption("--lease <令牌>", "接手时返回的令牌");
  addAction(back, () => import("./commands/work-agent.js"), "back", getContext);
  const release = work
    .command("release <作品>")
    .description("交还进行中的作品")
    .requiredOption("--lease <令牌>", "接手时返回的令牌");
  addAction(
    release,
    () => import("./commands/work-agent.js"),
    "release",
    getContext,
  );
  addAction(
    work.command("feedback <作品> <文字...>").description("提交作者反馈"),
    () => import("./commands/work-agent.js"),
    "feedback",
    getContext,
  );
  const createWork = work
    .command("new")
    .description("新建作品")
    .requiredOption("--account <账号,…>", "目标账号")
    .requiredOption("--title <标题>", "作品标题")
    .option("--brief <要求>", "写作要求");
  addAction(
    createWork,
    () => import("./commands/work-agent.js"),
    "new",
    getContext,
  );

  const convert = program
    .command("convert <灵感或作品>")
    .description("把灵感或作品转到其他账号")
    .requiredOption("--to <账号,…>", "目标账号")
    .option("--brief <要求>", "写作要求");
  addAction(
    convert,
    () => import("./commands/convert.js"),
    undefined,
    getContext,
  );

  const ideas = program
    .command("ideas")
    .description("列出灵感")
    .option("--status <状态,…>", "按状态筛选");
  addAction(ideas, () => import("./commands/ideas.js"), "list", getContext);
  const addIdea = ideas
    .command("add [一句话...]")
    .description("添加灵感")
    .option("--stdin", "从标准输入读取 JSON 数组")
    .option("--detail <细节>", "补充细节")
    .option("--account <账号>", "倾向账号")
    .option("--source <来源>", "来源", "quick")
    .option("--source-detail <来源补充>", "来源补充");
  addAction(addIdea, () => import("./commands/ideas.js"), "add", getContext);

  addAction(
    program.command("accounts").description("列出账号"),
    () => import("./commands/accounts.js"),
    "list",
    getContext,
  );
  const account = program.command("account").description("查看和添加账号");
  addAction(
    account.command("show <账号>").description("查看账号档案和接入状态"),
    () => import("./commands/accounts.js"),
    "show",
    getContext,
  );
  const addAccount = account
    .command("add")
    .description("添加账号")
    .requiredOption("--platform <平台>", "平台编号")
    .requiredOption("--name <名称>", "账号名称")
    .option("--intro <一句话>", "档案开头", "");
  addAction(
    addAccount,
    () => import("./commands/accounts.js"),
    "add",
    getContext,
  );

  const data = program.command("data").description("数据操作");
  const pull = data
    .command("pull")
    .description("拉取平台数据")
    .option("--account <账号,…>", "限定账号");
  addAction(pull, () => import("./commands/data.js"), undefined, getContext);
  addAction(
    program.command("export").description("导出记录库和档案备份"),
    () => import("./commands/export.js"),
    undefined,
    getContext,
  );
  const skill = program.command("skill").description("安装 LeafPress skill");
  addAction(
    skill
      .command("install")
      .description("安装到 Claude 和 Codex")
      .option("--force", "覆盖已存在的 skill"),
    () => import("./commands/skill.js"),
    undefined,
    getContext,
  );
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
    if (argument !== undefined)
      return `命令行参数不正确：缺少必需参数 ${argument}。`;
  }
  if (error.code === "commander.missingMandatoryOptionValue") {
    const option = /required option ['"](--[a-z0-9-]+)/i.exec(detail)?.[1];
    if (option !== undefined)
      return `命令行参数不正确：缺少必需选项 ${option}。`;
  }
  if (error.code === "commander.optionMissingArgument") {
    const option = /option ['"](--[a-z0-9-]+)/i.exec(detail)?.[1];
    if (option !== undefined)
      return `命令行参数不正确：选项 ${option} 缺少参数。`;
  }
  if (error.code === "commander.unknownCommand") {
    const name = /unknown command ['"]([^'"]+)['"]/i.exec(detail)?.[1];
    if (name !== undefined) return `命令行参数不正确：未知命令 ${name}。`;
  }
  if (error.code === "commander.excessArguments") {
    const name = /too many arguments for ['"]([^'"]+)['"]/i.exec(detail)?.[1];
    const extra = /got \d+: (.+)\.$/i.exec(detail)?.[1];
    return `命令「${name ?? ""}」不接受多余参数${extra === undefined ? "" : `：${extra.split(/,\s*/).join("、")}`}。`;
  }
  return `命令行参数不正确：${detail}`;
}

function acceptsFreeText(argv: readonly string[]): boolean {
  return argv.some(
    (part, index) =>
      (part === "work" && argv[index + 1] === "feedback") ||
      (part === "ideas" && argv[index + 1] === "add"),
  );
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  options: BuildProgramOptions = {},
): Promise<void> {
  let context: CliContext | undefined;
  const program = buildProgram({
    createContext: async (globalOptions) => {
      if (context !== undefined) return context;
      if (options.createContext !== undefined)
        context = await options.createContext(globalOptions);
      else {
        const { createCliContext } = await import("./context.js");
        context = createCliContext(globalOptions);
      }
      return context;
    },
  });
  try {
    await program.parseAsync([...argv], { from: "user" });
    if (context !== undefined) process.exitCode = context.exitCode;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      process.exitCode = 0;
      return;
    }
    if (error instanceof CommanderError && error.code === "commander.help") {
      if (argv.includes("--help") || argv.includes("-h")) return;
      const normalized = {
        code: "USAGE",
        message: "请指定要运行的命令。",
        hint: "运行 leafpress --help 查看用法。",
        name: "LeafPressError",
      };
      const output = formatCommandError(
        normalized,
        program.opts<{ json?: boolean }>().json === true,
      );
      (output.stream === "stdout" ? process.stdout : process.stderr).write(
        `${output.text}\n`,
      );
      process.exitCode = 2;
      return;
    }
    const usage = error instanceof CommanderError;
    const normalized = usage
      ? {
          code: "USAGE",
          message: commanderUsageMessage(error),
          hint:
            error.code === "commander.unknownOption" && acceptsFreeText(argv)
              ? "运行 leafpress --help 查看用法。文字以 - 开头时，在前面加 --"
              : "运行 leafpress --help 查看用法。",
          name: "LeafPressError",
        }
      : error;
    const output = formatCommandError(
      normalized,
      program.opts<{ json?: boolean }>().json === true,
      process.env["LEAFPRESS_DEBUG"] === "1",
    );
    (output.stream === "stdout" ? process.stdout : process.stderr).write(
      `${output.text}\n`,
    );
    if (output.stack !== undefined) process.stderr.write(`${output.stack}\n`);
    process.exitCode = usage ? 2 : output.exitCode;
  } finally {
    if (context !== undefined) await context.close();
  }
}

if (isMainModule(import.meta.main, process.argv[1])) void main();
