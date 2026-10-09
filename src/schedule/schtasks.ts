import type { ExecFn } from "../shared/exec.js";
import { describeFailure, limitReason, powershellArgs } from "./powershell.js";
import { psLiteral } from "./ps-literal.js";

export interface SchtasksOutcome {
  /** schtasks 是否以 0 退出 */
  ok: boolean;
  /** 系统给的说明：已压成一行、不超过 300 字；可能为空 */
  reason: string;
}

/**
 * 在 PowerShell 里跑 schtasks，拿回读得懂的原文。
 *
 * 为什么不直接调 schtasks.exe：它按系统代码页（中文系统是 GBK）写输出，
 * node 按 UTF-8 解码就是乱码，原文已经丢了。PowerShell 接原生命令的输出时
 * 本来就按控制台代码页解码，拿到的是正确的文字；再转成 UTF-8 的 base64（纯 ASCII）
 * 从标准输出交给 node，不依赖任何编码设置。
 *
 * 2>&1 把错误输出并进来。错误行会被包成 ErrorRecord，取 Exception.Message 才是原文；
 * 直接转字符串的话，空行会变成异常类型名。
 */
export function makeSchtasksScript(args: readonly string[]): string {
  return [
    `$lines = @(& schtasks.exe ${args.map((arg) => psLiteral(arg)).join(" ")} 2>&1 | ForEach-Object { if ($_ -is [Management.Automation.ErrorRecord]) { $_.Exception.Message } else { [string]$_ } })`,
    "$code = $LASTEXITCODE",
    "if ($null -eq $code) { $code = -1 }",
    "$text = $lines -join [Environment]::NewLine",
    "[pscustomobject]@{ exitCode = $code; outputBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text)) } | ConvertTo-Json -Compress",
    "exit 0",
  ].join("\n");
}

function parseOutcome(
  stdout: string,
): { exitCode: number; output: string } | undefined {
  try {
    const value: unknown = JSON.parse(stdout.trim());
    if (
      typeof value === "object" &&
      value !== null &&
      "exitCode" in value &&
      typeof value.exitCode === "number" &&
      "outputBase64" in value &&
      typeof value.outputBase64 === "string"
    ) {
      return {
        exitCode: value.exitCode,
        output: Buffer.from(value.outputBase64, "base64").toString("utf8"),
      };
    }
  } catch {
    // 不是预期的 JSON：按失败处理
  }
  return undefined;
}

/** 跑一次 schtasks；命令没跑成功时也不抛错，把系统给的原因放进 reason 交给调用方决定怎么说 */
export async function runSchtasks(
  exec: ExecFn,
  args: readonly string[],
): Promise<SchtasksOutcome> {
  const result = await exec(
    "powershell.exe",
    powershellArgs(makeSchtasksScript(args)),
  );
  if (result.timedOut || result.exitCode !== 0)
    return { ok: false, reason: describeFailure(result) };
  const outcome = parseOutcome(result.stdout);
  if (outcome === undefined)
    return { ok: false, reason: "读不懂 schtasks 的输出" };
  return { ok: outcome.exitCode === 0, reason: limitReason(outcome.output) };
}
