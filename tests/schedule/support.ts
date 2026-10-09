import { writeFile } from "node:fs/promises";

import { execCommand, type ExecResult } from "../../src/shared/exec.js";

export const ok: ExecResult = {
  stdout: "",
  stderr: "",
  exitCode: 0,
  timedOut: false,
};

/** UTF-8 的 BOM（U+FEFF）：Windows PowerShell 5.1 读无 BOM 的脚本会按 GBK，中文会乱 */
const UTF8_BOM = String.fromCharCode(0xfeff);

/** Unicode 替换字符 U+FFFD：文字按错的编码解码后会出现它，测试里用来断言没有乱码 */
export const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

export function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** 假 PowerShell 跑完 schtasks 的样子：schtasks 的退出码和原文（原文转 base64，和真实脚本一致） */
export function schtasksResult(exitCode: number, text = ""): ExecResult {
  return {
    ...ok,
    stdout: JSON.stringify({ exitCode, outputBase64: base64(text) }),
  };
}

/** 假查询脚本在失败时报的错：退出码 1，原因转 base64 写在标准输出 */
export function queryError(reason: string): ExecResult {
  return {
    ...ok,
    exitCode: 1,
    stdout: JSON.stringify({ error: base64(reason) }),
  };
}

/** 从交给 PowerShell 的脚本里取出 `& schtasks.exe` 后面的参数（单引号字面量，两个单引号表示一个） */
export function schtasksArgsOf(args: readonly string[]): string[] {
  const script = args.at(-1) ?? "";
  const match = /& schtasks\.exe ((?:'(?:[^']|'')*' ?)+) 2>&1/u.exec(script);
  if (match?.[1] === undefined)
    throw new Error(`脚本里没有 schtasks 调用：${script}`);
  return [...match[1].matchAll(/'((?:[^']|'')*)'/gu)].map((part) =>
    (part[1] ?? "").replaceAll("''", "'"),
  );
}

/** 写一个带 BOM 的 UTF-8 脚本：Windows PowerShell 5.1 读无 BOM 的脚本会按 GBK，中文会乱 */
export async function writePowerShellFile(
  path: string,
  text: string,
): Promise<void> {
  await writeFile(path, `${UTF8_BOM}${text}`, "utf8");
}

/** 用和计划任务一样的参数跑一个脚本文件 */
export function runPowerShellFile(path: string): Promise<ExecResult> {
  return execCommand(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path,
    ],
    { timeoutMs: 60_000 },
  );
}
