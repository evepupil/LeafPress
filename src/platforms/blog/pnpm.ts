/**
 * 跑博客仓库的 pnpm 命令。
 *
 * 本机的 pnpm 是 npm 装出来的 .cmd 外壳：Node 24 不经过 shell 直接起 pnpm.cmd 会报
 * spawn EINVAL，所以 Windows 上要借 cmd.exe 起（/d 不读自动运行脚本，/s /c 照字面执行）。
 * args 只能是代码里写死的脚本名和 LeafPress 自己生成的路径，不许拼用户输入。
 * 超时要连同 pnpm 起的一串子进程一起结束，所以带 killTree。
 *
 * 借了 cmd.exe 就有个副作用：PATH 里没有 pnpm 时，起不来的是 pnpm，cmd.exe 自己却正常退出，
 * 只留一句「不是内部或外部命令」。所以第一次用之前先探测 pnpm 在不在，不在就直接说清楚，
 * 别让后面的检查、安装依赖带着一句看不懂的输出失败。
 */
import type { ExecFn, ExecResult } from "../../shared/exec.js";

/** 不同系统上起 pnpm 的命令和参数 */
export function pnpmInvocation(
  platform: NodeJS.Platform,
  args: readonly string[],
): { command: string; args: string[] } {
  if (platform === "win32")
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "pnpm", ...args] };
  return { command: "pnpm", args: [...args] };
}

/** 找不到 pnpm。message 直接给人看，调用方不要再包装 */
export class PnpmNotFoundError extends Error {
  constructor() {
    super("找不到 pnpm：运行 LeafPress 的环境里 PATH 没有 pnpm");
    this.name = "PnpmNotFoundError";
  }
}

const PROBE_TIMEOUT_MS = 15_000;

/**
 * 已经确认过 pnpm 在的执行函数。按函数记：生产里执行函数只有一个，等于整个进程只探测一次；
 * 测试里换一个假的执行函数就会重新探测，不会互相串。
 * 只记「在」，不记「不在」：用户装好 pnpm 后不用重启服务就能立刻好。
 */
const confirmed = new WeakSet<ExecFn>();

/**
 * 确认 pnpm 在 PATH 里；不在就抛 PnpmNotFoundError。只有 Windows 需要（别的系统直接起 pnpm，
 * 找不到时 exec 自己会报「找不到命令 pnpm」）。
 * 探测本身没跑成（超时、cmd.exe 起不来、where 不认识）不下结论，让真正的命令自己报错。
 */
export async function ensurePnpmAvailable(
  exec: ExecFn,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform !== "win32" || confirmed.has(exec)) return;
  let probe: ExecResult;
  try {
    probe = await exec("cmd.exe", ["/d", "/s", "/c", "where pnpm"], {
      timeoutMs: PROBE_TIMEOUT_MS,
    });
  } catch {
    return;
  }
  if (probe.timedOut) return;
  // where 找到退出码 0、没找到退出码 1，别的退出码是 where 自己出了问题
  if (probe.exitCode === 0) confirmed.add(exec);
  else if (probe.exitCode === 1) throw new PnpmNotFoundError();
}

export async function runPnpm(
  exec: ExecFn,
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ExecResult> {
  await ensurePnpmAvailable(exec);
  const invocation = pnpmInvocation(process.platform, args);
  return exec(invocation.command, invocation.args, {
    cwd,
    timeoutMs,
    killTree: true,
  });
}
