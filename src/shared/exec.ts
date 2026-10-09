/**
 * 外部命令执行：所有要调 git 之类外部工具的地方都走这一个入口。
 *
 * 原理：用 child_process.execFile 且不经过 shell，参数原样传给目标程序，
 * 路径里有空格、中文都不会出问题，也没有 shell 注入风险。
 * 命令失败（非零退出码）不是异常，属于正常结果，返回 exitCode 让调用方判断；
 * 只有「命令本身找不到」「工作目录不存在」「输出超限」才算异常，抛统一错误。
 *
 * killTree：跑 pnpm build 这类会再起一串子进程的命令时，超时只杀直接子进程会留下孤儿。
 * 打开这个选项后改用 spawn 自己计时，到点把整个进程树一起结束
 * （Windows 用 taskkill /T /F，其他系统让子进程自成一个进程组再整组杀）。
 *
 * 输出解码：两条路径都先收原始字节，跑完再整体解码（见 decodeOutput），
 * 这样多字节字符被拆在两块数据之间也不会出错。
 */
import {
  execFile,
  spawn,
  type ChildProcess,
  type ChildProcessByStdio,
  type ExecFileException,
} from "node:child_process";
import { existsSync } from "node:fs";
import type { Readable } from "node:stream";

import { decodeOutput } from "./decode-output.js";
import { LeafPressError } from "./errors.js";

/** 执行参数 */
export interface ExecOptions {
  /** 工作目录；不填用当前进程的工作目录 */
  cwd?: string;
  /** 超时毫秒数；不填 30 秒 */
  timeoutMs?: number;
  /** 超时时连同子进程树一起结束（会起一串子进程的命令用，比如 pnpm build） */
  killTree?: boolean;
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
/** 进程树杀掉后，最多再等这么久收尾；还没等到（有漏网的子孙占着输出管道）就直接放手 */
const KILL_GRACE_MS = 2_000;

/** 命令跑完后的原始结局；error 的样子和 execFile 回调里的一样 */
interface RawOutcome {
  error: ExecFileException | null;
  stdout: string;
  stderr: string;
  /** 只有 killTree 路径会置位：到点后整个进程树被结束了 */
  timedOut: boolean;
}

/** 普通路径：交给 execFile，超时只杀直接子进程 */
function runWithExecFile(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  options: ExecOptions | undefined,
): Promise<RawOutcome> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        // 不经过 shell：参数原样传递，没有注入风险
        shell: false,
        windowsHide: true,
        // 要原始字节，由 decodeOutput 决定怎么解码
        encoding: "buffer",
        maxBuffer: MAX_BUFFER_BYTES,
        timeout: timeoutMs,
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(options?.env === undefined ? {} : { env: options.env }),
      },
      (error, stdout, stderr) => {
        resolve({
          error,
          stdout: decodeOutput(stdout),
          stderr: decodeOutput(stderr),
          timedOut: false,
        });
      },
    );
  });
}

/** 把整个进程树结束掉；拿不到进程号或杀不了时退而求其次，至少结束直接子进程 */
function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) {
    child.kill("SIGKILL");
    return;
  }
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.once("error", () => {
      child.kill("SIGKILL");
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/** killTree 路径：spawn 起进程，自己收输出、自己计时，到点结束整个进程树 */
function runWithTreeKill(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  options: ExecOptions,
): Promise<RawOutcome> {
  return new Promise((resolve) => {
    // 标准输入不留管道：命令读输入时直接得到结束，不会傻等
    const child: ChildProcessByStdio<null, Readable, Readable> = spawn(
      command,
      [...args],
      {
        shell: false,
        windowsHide: true,
        // 非 Windows 上让子进程自成进程组，超时才能整组结束
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(options.env === undefined ? {} : { env: options.env }),
      },
    );

    // 收原始字节，跑完再整体解码
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let overflowed = false;
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    // 到点：结束整个进程树。回调里用到的 finish 在下面才定义，回调执行时早已就绪
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
      graceTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(null);
      }, KILL_GRACE_MS);
    }, timeoutMs);

    const finish = (error: ExecFileException | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      resolve({
        error,
        stdout: decodeOutput(Buffer.concat(stdoutChunks)),
        stderr: decodeOutput(Buffer.concat(stderrChunks)),
        timedOut,
      });
    };

    const overflow = (): void => {
      if (overflowed) return;
      overflowed = true;
      killProcessTree(child);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_BUFFER_BYTES) overflow();
      else stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_BUFFER_BYTES) overflow();
      else stderrChunks.push(chunk);
    });

    // 命令起不来（找不到、工作目录不存在）会走这里，错误带 code: ENOENT
    child.once("error", (error) => {
      finish(error);
    });
    child.once("close", (code, signal) => {
      if (overflowed) {
        finish(
          Object.assign(new Error("命令输出超过上限"), {
            code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
          }),
        );
      } else if (code === 0) {
        finish(null);
      } else if (code !== null) {
        finish(Object.assign(new Error(`命令退出码 ${code}`), { code }));
      } else {
        // 被外部信号结束（不是我们到点杀的）：和 execFile 一样当作异常退出，交给 interpret 报错
        finish(
          Object.assign(new Error(`命令被信号 ${String(signal)} 结束`), {
            signal: signal ?? undefined,
          }),
        );
      }
    });
  });
}

/** 把原始结局翻成统一的结果；命令找不到、工作目录不存在、输出超限这类按异常抛 */
function interpret(
  raw: RawOutcome,
  command: string,
  options: ExecOptions | undefined,
): ExecResult {
  const { error, stdout, stderr } = raw;
  if (raw.timedOut) return { stdout, stderr, exitCode: -1, timedOut: true };
  if (error === null) return { stdout, stderr, exitCode: 0, timedOut: false };

  // ENOENT 不一定是命令不存在：cwd 不存在也报 ENOENT。
  // 先看 cwd，cwd 真在才轮到「找不到命令」
  if (error.code === "ENOENT") {
    if (options?.cwd !== undefined && !existsSync(options.cwd)) {
      throw new LeafPressError("USAGE", `工作目录不存在：${options.cwd}`, {
        hint: "请检查配置的仓库路径是否正确，目录是否被移动或删除。",
      });
    }
    throw new LeafPressError("EXTERNAL_TOOL_MISSING", `找不到命令 ${command}`, {
      hint: `请确认 ${command} 已安装并在 PATH 里，再重新执行。`,
    });
  }
  // 输出超过 maxBuffer：内容不完整，不能当正常结果用
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    throw new LeafPressError("INTERNAL", `命令输出超过 16MB：${command}`, {
      hint: "这个命令的输出异常地大，请检查它是不是在对错误的目录或仓库执行。",
    });
  }
  // 退出码是数字：命令跑了但以非零退出码结束，属于正常结果
  if (typeof error.code === "number") {
    return { stdout, stderr, exitCode: error.code, timedOut: false };
  }
  // 只有 execFile 因超时杀进程（killed 为真且有信号）才算超时
  if (
    error.killed === true &&
    error.signal !== undefined &&
    error.signal !== null
  ) {
    return { stdout, stderr, exitCode: -1, timedOut: true };
  }
  // 其他没有退出码的情况：不知道进程怎么结束的，按异常抛出，不能静默当超时
  throw new LeafPressError(
    "INTERNAL",
    `命令 ${command} 异常退出：${error.message}`,
  );
}

/** 执行外部命令：不经过 shell，输出先按 UTF-8、不是 UTF-8 再按 GB18030 解码（见 decodeOutput） */
export async function execCommand(
  command: string,
  args: readonly string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const raw = options?.killTree
    ? await runWithTreeKill(command, args, timeoutMs, options)
    : await runWithExecFile(command, args, timeoutMs, options);
  return interpret(raw, command, options);
}
