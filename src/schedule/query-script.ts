import { psLiteral } from "./ps-literal.js";

/**
 * 查询计划任务的 PowerShell 脚本；标准输出是一行 JSON：
 * - 任务不存在：{"installed":false}，退出码 0
 * - 任务存在：任务的各项字段，退出码 0
 * - 其他任何失败：{"error":"<原因的 base64>"}，退出码 1
 *
 * 为什么「找不到」要单独认：只有系统明确说「没有这个任务」才能当成没装。
 * 把所有失败都当成没装，卸载时任务明明还在，却会删掉启动脚本、把状态改成没装，
 * 之后任务每天空跑失败，网页还显示没装。
 *
 * 「找不到」的样子：Get-ScheduledTask 抛 CIM 异常（实测 Windows 11 上类型是
 * CimJobException，其他版本可能是 CimException），错误类别 ObjectNotFound。
 * 类别要和异常类型一起认：命令不存在（CommandNotFoundException）的类别也是 ObjectNotFound。
 *
 * 上次运行结果代码是无符号 32 位数（如 0x800710E0 = 2147946720），
 * 转成有符号 32 位整数会溢出报错，所以用 64 位整数。
 *
 * 路径等中文内容一律转成 base64 再输出：PowerShell 的标准输出按系统代码页（中文系统是 GBK）编码，
 * 直接输出中文交给 node 按 UTF-8 解码会乱码。
 */
export function makeQueryScript(taskName: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  try { $task = Get-ScheduledTask -TaskName ${psLiteral(taskName)} -TaskPath '\\' -ErrorAction Stop }`,
    "  catch {",
    "    $kind = $_.Exception.GetType().Name",
    "    if (($kind -eq 'CimException' -or $kind -eq 'CimJobException') -and $_.CategoryInfo.Category -eq 'ObjectNotFound') { '{\"installed\":false}'; exit 0 }",
    "    throw",
    "  }",
    "  $info = Get-ScheduledTaskInfo -InputObject $task",
    "  $trigger = $task.Triggers | Select-Object -First 1",
    "  $action = $task.Actions | Select-Object -First 1",
    "  $description = [string]$task.Description",
    "  $prefix = 'LeafPress 每天拉作品数据（数据目录：'; $suffix = '）'; $dataHome = $null",
    "  if ($description.StartsWith($prefix) -and $description.EndsWith($suffix)) { $dataHome = $description.Substring($prefix.Length, $description.Length - $prefix.Length - $suffix.Length) }",
    "  $homeBase64 = $null; if ($null -ne $dataHome) { $homeBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dataHome)) }",
    "  $nodePath = $null; $entryPath = $null",
    '  $wrapperMatch = [regex]::Match([string]$action.Arguments, \'-File\\s+(?:"([^"]+)"|(\\S+))\')',
    "  $wrapperPath = $null; if ($wrapperMatch.Success) { $wrapperPath = $wrapperMatch.Groups[1].Value; if ([string]::IsNullOrEmpty($wrapperPath)) { $wrapperPath = $wrapperMatch.Groups[2].Value } }",
    "  if ($wrapperPath -and [IO.File]::Exists($wrapperPath)) { $wrapperText = [IO.File]::ReadAllText($wrapperPath); $nodeMatch = [regex]::Match($wrapperText, '(?m)^# LeafPressNodePath: ([A-Za-z0-9+/=]+)$'); $entryMatch = [regex]::Match($wrapperText, '(?m)^# LeafPressEntryPath: ([A-Za-z0-9+/=]+)$'); if ($nodeMatch.Success) { try { $nodePath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($nodeMatch.Groups[1].Value)) } catch { $nodePath = $null } }; if ($entryMatch.Success) { try { $entryPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($entryMatch.Groups[1].Value)) } catch { $entryPath = $null } } }",
    "  $nodeBase64 = $null; if ($null -ne $nodePath) { $nodeBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($nodePath)) }",
    "  $entryBase64 = $null; if ($null -ne $entryPath) { $entryBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($entryPath)) }",
    "  $lastRun = $null; if ($info.LastTaskResult -ne 267011 -and $info.LastRunTime.Year -gt 2000) { $lastRun = $info.LastRunTime.ToString('o') }",
    "  $nextRun = $null; if ($info.NextRunTime.Year -gt 2000) { $nextRun = $info.NextRunTime.ToString('o') }",
    "  [pscustomobject]@{ installed = $true; state = [string]$task.State; enabled = [bool]$task.Settings.Enabled; homeBase64 = $homeBase64; nodePathBase64 = $nodeBase64; entryPathBase64 = $entryBase64; startBoundary = [string]$trigger.StartBoundary; startWhenAvailable = [bool]$task.Settings.StartWhenAvailable; runOnlyIfNetworkAvailable = [bool]$task.Settings.RunOnlyIfNetworkAvailable; logonType = [string]$task.Principal.LogonType; lastRunAt = $lastRun; nextRunAt = $nextRun; lastResult = [long]$info.LastTaskResult } | ConvertTo-Json -Compress -Depth 3",
    "} catch {",
    "  [pscustomobject]@{ error = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$_.Exception.Message)) } | ConvertTo-Json -Compress",
    "  exit 1",
    "}",
  ].join("\n");
}
