import type { ExecResult } from "../shared/exec.js";

/** 错误原因最多留这么多字：命令行里一行说清楚即可 */
const MAX_REASON_CHARS = 300;

/** Unicode 替换字符：字节按错的编码解码时，解不出来的部分会变成它，出现就说明文字已经是乱码 */
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

/** 非交互、不读用户配置、不受执行策略限制地跑一段 PowerShell */
export function powershellArgs(script: string): string[] {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ];
}

/** 压成一行并截到 300 字以内；超长时末尾用省略号，省略号也算在 300 字里 */
export function limitReason(text: string): string {
  const oneLine = text.replace(/\s+/gu, " ").trim();
  const chars = Array.from(oneLine);
  if (chars.length <= MAX_REASON_CHARS) return oneLine;
  return `${chars.slice(0, MAX_REASON_CHARS - 1).join("")}…`;
}

/** 「做什么失败」加上系统给的原因；拿不到原因就只说做什么失败 */
export function failureMessage(what: string, reason: string): string {
  return reason.length === 0 ? `${what}。` : `${what}：${reason}`;
}

/** 脚本自己报的错：catch 里把原因转成 base64，写在标准输出的 {"error":"…"} 里 */
function reportedError(stdout: string): string | undefined {
  try {
    const value: unknown = JSON.parse(stdout.trim());
    if (
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "string"
    ) {
      return Buffer.from(value.error, "base64").toString("utf8");
    }
  } catch {
    // 标准输出不是 JSON：脚本没来得及报错，交给后面兜底
  }
  return undefined;
}

/**
 * PowerShell 这一层失败（超时、退出码非 0）时的原因。
 *
 * 优先取脚本自己报的原因：它在 PowerShell 里是正确的文字，再转成 ASCII 的 base64 交过来，
 * 不受控制台代码页影响。脚本没来得及报错（比如 PowerShell 没起来）时只能看错误输出，
 * 它是系统代码页（中文系统是 GBK），按 UTF-8 解码会乱码，出现乱码就不展示，只说退出码。
 */
export function describeFailure(
  result: Pick<ExecResult, "stdout" | "stderr" | "exitCode" | "timedOut">,
): string {
  if (result.timedOut) return "命令超时";
  const reported = reportedError(result.stdout);
  if (reported !== undefined) return limitReason(reported);
  const stderr = limitReason(result.stderr);
  if (stderr.length > 0 && !stderr.includes(REPLACEMENT_CHAR)) return stderr;
  return `PowerShell 退出码 ${result.exitCode}`;
}
