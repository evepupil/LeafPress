import { join } from "node:path";

import { psLiteral } from "./ps-literal.js";

export interface WrapperScriptInput {
  nodePath: string;
  entryPath: string;
  homePath: string;
}

function encodedMetadata(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/**
 * 启动脚本：隐藏窗口起 node 拉数据，等它结束，退出码照传。
 *
 * 为什么要自己接住「node 起不来」：Start-Process 失败时（node 路径不在了、被拦截）
 * 进程对象是空的，只在 PowerShell 自己的错误流里留一行字，计划任务看不到。
 * 脚本最后取空对象的退出码得到空值，等于以 0 退出：计划任务记成功、不触发失败重试，
 * 作者也没处查原因。所以起不来时把原因写进错误日志，再以 1 退出；
 * 拿到进程对象之后才去取退出码。
 *
 * 每次先确保日志目录在：被清理掉的话，重定向日志本身会让 Start-Process 失败，
 * 错误日志也就写不进去。
 */
export function buildWrapperScript(input: WrapperScriptInput): string {
  const args = `"${input.entryPath}" data pull --scheduled --home "${input.homePath}"`;
  const logsPath = join(input.homePath, "logs");
  const stdoutPath = join(logsPath, "data-pull.out.log");
  const stderrPath = join(logsPath, "data-pull.err.log");
  // 错误日志写成无 BOM 的 UTF-8，和 node 自己写进去的内容保持一致
  const writeFailure = `try { [IO.File]::WriteAllText($errorLog, ${psLiteral(`无法启动 node（${input.nodePath}）：`)} + $failure, (New-Object Text.UTF8Encoding($false))) } catch { }`;
  return [
    "# LeafPress scheduled data pull",
    `# LeafPressNodePath: ${encodedMetadata(input.nodePath)}`,
    `# LeafPressEntryPath: ${encodedMetadata(input.entryPath)}`,
    `$errorLog = ${psLiteral(stderrPath)}`,
    "$process = $null",
    "$failure = $null",
    "try {",
    `  New-Item -ItemType Directory -Force -Path ${psLiteral(logsPath)} | Out-Null`,
    `  $process = Start-Process -FilePath ${psLiteral(input.nodePath)} -ArgumentList ${psLiteral(args)} -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput ${psLiteral(stdoutPath)} -RedirectStandardError ${psLiteral(stderrPath)} -ErrorAction Stop`,
    "} catch {",
    "  $failure = $_.Exception.Message",
    "}",
    "if ($null -eq $failure -and $null -eq $process) { $failure = 'Start-Process 没有返回进程对象' }",
    "if ($null -eq $failure -and $null -eq $process.ExitCode) { $failure = '拿不到 node 的退出码' }",
    "if ($null -ne $failure) {",
    `  ${writeFailure}`,
    "  exit 1",
    "}",
    "exit $process.ExitCode",
    "",
  ].join("\n");
}
