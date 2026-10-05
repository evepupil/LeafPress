/**
 * git 命令执行的公共底层：runGit 和统一参数。
 *
 * 原理：git.ts（快进拉取）和 repo-status.ts（状态读取）都从这里导入，
 * 避免两个业务模块互相引用；git 命令统一加 GIT_BASE_ARGS，走注入的 ExecFn。
 */
import type { ExecFn, ExecOptions } from "../../shared/exec.js";

/** git 命令统一加的参数：--no-optional-locks 让 status 之类不写 .git/index（体检不改任何东西）；
 *  core.quotepath=false 关掉路径的八进制转义，中文文件名才能原样显示 */
export const GIT_BASE_ARGS = [
  "--no-optional-locks",
  "-c",
  "core.quotepath=false",
] as const;

function gitOptions(timeoutMs?: number): ExecOptions {
  return timeoutMs === undefined ? {} : { timeoutMs };
}

/** 拼一条 git 命令并执行 */
export async function runGit(
  exec: ExecFn,
  repoPath: string,
  args: readonly string[],
  timeoutMs?: number,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}> {
  const result = await exec("git", [...GIT_BASE_ARGS, ...args], {
    cwd: repoPath,
    ...gitOptions(timeoutMs),
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
  };
}
