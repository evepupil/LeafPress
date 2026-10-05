/**
 * 外部命令执行：所有要调 git 之类外部工具的地方都走这一个入口。
 *
 * 原理：用 child_process.execFile 且不经过 shell，参数原样传给目标程序，
 * 路径里有空格、中文都不会出问题，也没有 shell 注入风险。
 * 命令失败（非零退出码）不是异常，属于正常结果，返回 exitCode 让调用方判断；
 * 只有「命令本身找不到」「工作目录不存在」「输出超限」才算异常，抛统一错误。
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

import { LeafPressError } from "./errors.js";

/** 执行参数 */
export interface ExecOptions {
  /** 工作目录；不填用当前进程的工作目录 */
  cwd?: string;
  /** 超时毫秒数；不填 30 秒 */
  timeoutMs?: number;
  /** 子进程环境变量；不填继承当前进程 */
  env?: NodeJS.ProcessEnv;
}

/** 执行结果 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  /** 退出码；被超时杀掉时为 -1 */
  exitCode: number;
  /** 是否因超时被杀 */
  timedOut: boolean;
}

/** 外部命令的执行函数；平台接入通过它调 git，测试时可以换成假实现 */
export type ExecFn = (
  command: string,
  args: readonly string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

/** 缺省超时：30 秒 */
const DEFAULT_TIMEOUT_MS = 30_000;
/** 输出上限：16MB，防止把内存撑爆 */
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/** 执行外部命令：不经过 shell，输出按 utf8 解码 */
export function execCommand(
  command: string,
  args: readonly string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        // 不经过 shell：参数原样传递，没有注入风险
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: MAX_BUFFER_BYTES,
        timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(options?.env === undefined ? {} : { env: options.env }),
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr, exitCode: 0, timedOut: false });
          return;
        }
        // ENOENT 不一定是命令不存在：cwd 不存在也报 ENOENT。
        // 先看 cwd，cwd 真在才轮到「找不到命令」
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          if (options?.cwd !== undefined && !existsSync(options.cwd)) {
            reject(
              new LeafPressError("USAGE", `工作目录不存在：${options.cwd}`, {
                hint: "请检查配置的仓库路径是否正确，目录是否被移动或删除。",
              }),
            );
            return;
          }
          reject(
            new LeafPressError(
              "EXTERNAL_TOOL_MISSING",
              `找不到命令 ${command}`,
              {
                hint: `请确认 ${command} 已安装并在 PATH 里，再重新执行。`,
              },
            ),
          );
          return;
        }
        // 输出超过 maxBuffer：内容不完整，不能当正常结果用
        if (
          (error as NodeJS.ErrnoException).code ===
          "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
        ) {
          reject(
            new LeafPressError("INTERNAL", `命令输出超过 16MB：${command}`, {
              hint: "这个命令的输出异常地大，请检查它是不是在对错误的目录或仓库执行。",
            }),
          );
          return;
        }
        // 退出码是数字：命令跑了但以非零退出码结束，属于正常结果
        if (typeof error.code === "number") {
          resolve({
            stdout,
            stderr,
            exitCode: error.code,
            timedOut: false,
          });
          return;
        }
        // 只有 execFile 因超时杀进程（killed 为真且有信号）才算超时
        if (error.killed === true && error.signal !== null) {
          resolve({ stdout, stderr, exitCode: -1, timedOut: true });
          return;
        }
        // 其他没有退出码的情况：不知道进程怎么结束的，按异常抛出，不能静默当超时
        reject(
          new LeafPressError(
            "INTERNAL",
            `命令 ${command} 异常退出：${error.message}`,
          ),
        );
      },
    );
  });
}
