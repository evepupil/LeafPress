/**
 * 在博客仓库（作者的仓库和 LeafPress 的检出目录）里跑 git：统一的环境、超时连子进程一起结束、
 * 失败信息整理。检出（checkout.ts）和推送（steps/publish-git.ts）都从这里跑 git。
 */
import type { ExecFn, ExecOptions, ExecResult } from "../../shared/exec.js";
import { redactUrlCredentials } from "./url-redact.js";

/** 追加在 ssh 命令后面的选项：不许等人输入口令或确认指纹（等了也没人答，只会干等到超时） */
const BATCH_MODE_OPTION = "-o BatchMode=yes";
const CONFIG_LOOKUP_TIMEOUT_MS = 15_000;
/** 会连远程的 git 子命令；别的子命令（checkout、rebase、commit……）只动本地 */
const NETWORK_SUBCOMMANDS = new Set([
  "fetch",
  "push",
  "pull",
  "clone",
  "ls-remote",
]);

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 不联网的 git 命令用的环境：不许弹出输入口令的提示。
 * GCM_INTERACTIVE 是 Windows 上 Git Credential Manager 的开关，免得 https 远程的登录窗口弹出来干等。
 */
export function localGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  };
}

/** 作者仓库里（含全局配置）配的 core.sshCommand；没配或查不出来返回 undefined */
async function configuredSshCommand(
  exec: ExecFn,
  cwd: string,
): Promise<string | undefined> {
  try {
    const result = await exec("git", ["config", "--get", "core.sshCommand"], {
      cwd,
      timeoutMs: CONFIG_LOOKUP_TIMEOUT_MS,
    });
    return result.exitCode === 0 && !result.timedOut
      ? nonEmpty(result.stdout)
      : undefined;
  } catch {
    // 查不出来就当作没配；仓库真有问题，后面的 git 命令自己会报
    return undefined;
  }
}

/**
 * 联网的 git 命令用的环境：在不弹提示的基础上，让 ssh 不许等交互。
 *
 * 作者可能已经用 ssh 命令指定了密钥、或者用 Windows 自带的 OpenSSH，
 * 所以不能直接盖成 `ssh -o BatchMode=yes`，那会让作者终端里好好的 git 在这里报
 * Permission denied (publickey)。按 git 自己的优先顺序找作者已有的 ssh 命令，在它后面追加选项：
 * 1. 环境变量 GIT_SSH_COMMAND；
 * 2. 作者仓库的 git config core.sshCommand（含全局配置）；
 * 3. 都没有时，只设了 GIT_SSH 的话不动它（它是一个程序路径，不能加参数，也不能再设
 *    GIT_SSH_COMMAND，那会盖掉它）；GIT_SSH 也没设才用 `ssh -o BatchMode=yes`。
 */
export async function networkGitEnv(
  exec: ExecFn,
  cwd: string,
): Promise<NodeJS.ProcessEnv> {
  const env = localGitEnv();
  const existing =
    nonEmpty(process.env["GIT_SSH_COMMAND"]) ??
    (await configuredSshCommand(exec, cwd));
  if (existing !== undefined) {
    env["GIT_SSH_COMMAND"] = `${existing} ${BATCH_MODE_OPTION}`;
  } else if (nonEmpty(process.env["GIT_SSH"]) === undefined) {
    env["GIT_SSH_COMMAND"] = `ssh ${BATCH_MODE_OPTION}`;
  }
  return env;
}

/** git 命令行里的子命令名：跳过 -C <路径>、-c <配置> 这类带一个值的全局选项 */
function gitSubcommand(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg === "-C" || arg === "-c") {
      index += 1;
    } else if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return undefined;
}

/**
 * 在指定目录跑 git；超时连子进程一起结束。失败（非零退出码）不抛错，调用方看 exitCode。
 * 只有联网的子命令才去查作者的 ssh 设置，本地命令不多花这一次查询。
 */
export async function runBlogGit(
  exec: ExecFn,
  cwd: string,
  args: readonly string[],
  timeoutMs?: number,
): Promise<ExecResult> {
  const subcommand = gitSubcommand(args);
  const options: ExecOptions = {
    cwd,
    env:
      subcommand !== undefined && NETWORK_SUBCOMMANDS.has(subcommand)
        ? await networkGitEnv(exec, cwd)
        : localGitEnv(),
    killTree: true,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
  return exec("git", args, options);
}

/** 命令没成功（非零退出码或超时） */
export function commandFailed(result: ExecResult): boolean {
  return result.exitCode !== 0 || result.timedOut;
}

/** 取一段命令输出的最后几行，抹掉网址里的账号信息；用来拼进错误信息 */
export function outputTail(result: ExecResult, lines = 5): string {
  const text = [result.stderr, result.stdout]
    .filter((part) => part.trim() !== "")
    .join("\n")
    .trim();
  return redactUrlCredentials(text.split(/\r?\n/).slice(-lines).join("\n"));
}

/** 跑 git，没成功就抛错：`description[（超时）][：输出末尾]` */
export async function requireGit(
  exec: ExecFn,
  cwd: string,
  args: readonly string[],
  description: string,
  timeoutMs?: number,
): Promise<ExecResult> {
  const result = await runBlogGit(exec, cwd, args, timeoutMs);
  if (commandFailed(result)) {
    const detail = outputTail(result);
    throw new Error(
      `${description}${result.timedOut ? "（超时）" : ""}${detail ? `：${detail}` : ""}`,
    );
  }
  return result;
}
