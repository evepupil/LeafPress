/**
 * 在博客检出目录里跑 pnpm 检查：计时、截取失败输出的末尾、整理成 检查结果.txt。
 */
import type { CodeStepContext } from "../../types.js";
import { PnpmNotFoundError, runPnpm } from "../pnpm.js";
import { redactBlogText } from "./config.js";

/** 失败时附在结果里的输出行数 */
const TAIL_LINES = 80;

export interface CheckSpec {
  /** 给人看的名字，同时出现在失败提示里 */
  name: string;
  /** pnpm 的参数（只许写死的脚本名和 LeafPress 生成的路径） */
  args: readonly string[];
  timeoutMs: number;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  elapsedMs: number;
  /** 没过时：输出的最后 80 行 */
  tail?: string;
}

/** 文本的最后 count 行 */
export function lastLines(text: string, count: number): string {
  // 先去掉结尾的空白，不然输出最后一个换行会白占一行
  return text.trimEnd().split(/\r?\n/).slice(-count).join("\n").trim();
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

/**
 * 跑一项检查。开跑前先给租约续期；命令起不来、超时、非零退出都算没过，不抛错。
 * 唯一的例外是找不到 pnpm：那不是哪一项检查没过，而是运行环境没配好，
 * 抛 PnpmNotFoundError 让整个步骤直接失败，免得淹没在检查结果里。
 */
export async function runCheck(
  ctx: Pick<CodeStepContext, "exec" | "heartbeat" | "secret">,
  dir: string,
  spec: CheckSpec,
): Promise<CheckResult> {
  ctx.heartbeat();
  const started = performance.now();
  const elapsed = (): number => Math.round(performance.now() - started);
  try {
    const result = await runPnpm(ctx.exec, dir, spec.args, spec.timeoutMs);
    if (result.exitCode === 0 && !result.timedOut) {
      return { name: spec.name, passed: true, elapsedMs: elapsed() };
    }
    const output = redactBlogText(
      ctx,
      [result.stdout, result.stderr].filter(Boolean).join("\n"),
    );
    const timeout = result.timedOut
      ? `超过 ${Math.round(spec.timeoutMs / 60_000)} 分钟没跑完，已结束`
      : "";
    return {
      name: spec.name,
      passed: false,
      elapsedMs: elapsed(),
      tail:
        [timeout, lastLines(output, TAIL_LINES)].filter(Boolean).join("\n") ||
        "命令失败，没有输出",
    };
  } catch (error) {
    if (error instanceof PnpmNotFoundError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: spec.name,
      passed: false,
      elapsedMs: elapsed(),
      tail: lastLines(redactBlogText(ctx, message), TAIL_LINES),
    };
  }
}

/** 检查结果.txt：每项通过 / 没过和用时；第一个没过的附最后 80 行输出 */
export function formatReport(results: readonly CheckResult[]): string {
  const failed = results.find((result) => !result.passed);
  const lines = [
    `博客检查：${failed ? "没过" : "全过"}`,
    ...results.map(
      (result) =>
        `${result.name}：${result.passed ? "通过" : "没过"}（${seconds(result.elapsedMs)}）`,
    ),
  ];
  if (failed?.tail) {
    lines.push("", `${failed.name} 最后 ${TAIL_LINES} 行输出：`, failed.tail);
  }
  return `${lines.join("\n")}\n`;
}
