import { describe, expect, it } from "vitest";

import { queryTask } from "../../src/schedule/windows.js";
import { execCommand, type ExecFn } from "../../src/shared/exec.js";

const notWindows = process.platform !== "win32";
const taskName = "LeafPressDataPullTest-shim";

/**
 * 在真实的查询脚本前面塞几个同名的假命令再交给真实 PowerShell 跑。
 * PowerShell 里函数的优先级高于 cmdlet，脚本里的 Get-ScheduledTask 就会调到假的：
 * 这样能稳定造出「上次结果是大于 2^31 的无符号数」「拒绝访问」这类真实系统里很难凑出来的情形，
 * 而脚本本身、PowerShell 的解析和类型转换、JSON 输出都是真的。
 */
function withShim(shim: string): ExecFn {
  return (command, args, options) => {
    const script = args.at(-1) ?? "";
    return execCommand(
      command,
      [...args.slice(0, -1), `${shim}\n${script}`],
      options,
    );
  };
}

function foundShim(lastResult: number): string {
  return [
    "function Get-ScheduledTask {",
    "  [CmdletBinding()] param($TaskName, $TaskPath)",
    "  [pscustomobject]@{ State = 'Ready'; Description = ''; Settings = [pscustomobject]@{ Enabled = $true; StartWhenAvailable = $true; RunOnlyIfNetworkAvailable = $true }; Principal = [pscustomobject]@{ LogonType = 'Interactive' }; Triggers = @([pscustomobject]@{ StartBoundary = '2026-10-10T06:00:00' }); Actions = @([pscustomobject]@{ Arguments = '' }) }",
    "}",
    "function Get-ScheduledTaskInfo {",
    "  [CmdletBinding()] param($InputObject)",
    // LastTaskResult 在真实系统里就是 UInt32
    `  [pscustomobject]@{ LastTaskResult = [uint32]${lastResult}; LastRunTime = [datetime]'2026-10-08T06:00:01'; NextRunTime = [datetime]'2026-10-10T06:00:00' }`,
    "}",
  ].join("\n");
}

/** 让 Get-ScheduledTask 抛一个指定类型和类别的终止错误 */
function failingShim(exceptionType: string, message: string, category: string) {
  return [
    "function Get-ScheduledTask {",
    "  [CmdletBinding()] param($TaskName, $TaskPath)",
    `  $PSCmdlet.ThrowTerminatingError((New-Object Management.Automation.ErrorRecord((New-Object ${exceptionType}('${message}')), 'ShimError', '${category}', $TaskName)))`,
    "}",
  ].join("\n");
}

describe.skipIf(notWindows)("查询脚本在真实 PowerShell 里", () => {
  it.each([
    ["0x800710E0", 2147946720],
    ["0xC000013A", 3221225786],
    ["0xFFFFFFFF", 4294967295],
  ])(
    "上次运行结果 %s 是无符号 32 位数，不溢出也不报错",
    async (_name, code) => {
      const exec = withShim(foundShim(code));

      const task = await queryTask({ exec, taskName });

      expect(task).toMatchObject({
        installed: true,
        state: "Ready",
        enabled: true,
        lastResult: code,
        startWhenAvailable: true,
        runOnlyIfNetworkAvailable: true,
      });
      expect(task.lastRunAt).toBeDefined();
    },
    60_000,
  );

  it("拒绝访问不是「没装」：抛错并带上系统原因", async () => {
    const exec = withShim(
      failingShim(
        "UnauthorizedAccessException",
        "拒绝访问。",
        "PermissionDenied",
      ),
    );

    await expect(queryTask({ exec, taskName })).rejects.toMatchObject({
      code: "STORE_FAILED",
      message: "查询计划任务失败：拒绝访问。",
    });
  }, 60_000);

  it("类别是 ObjectNotFound 但不是 CIM 异常（比如命令不存在）也不当成没装", async () => {
    const exec = withShim(
      failingShim(
        "System.Management.Automation.ItemNotFoundException",
        "找不到项。",
        "ObjectNotFound",
      ),
    );

    await expect(queryTask({ exec, taskName })).rejects.toMatchObject({
      message: "查询计划任务失败：找不到项。",
    });
  }, 60_000);
});
