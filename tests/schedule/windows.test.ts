import { describe, expect, it } from "vitest";

import {
  describeLastResult,
  scheduleStatus,
  taskNameFor,
} from "../../src/schedule/index.js";
import { makeQueryScript } from "../../src/schedule/query-script.js";
import { queryTask, removeTask } from "../../src/schedule/windows.js";
import type { ExecFn } from "../../src/shared/exec.js";
import { REPLACEMENT_CHAR, base64, ok, queryError } from "./support.js";

const taskName = "LeafPressDataPullTest-unit";
const home = "C:\\LeafPress Data";
const nodePath = "C:\\Program Files\\node.exe";
const entryPath = "C:\\LeafPress\\dist\\cli\\main.js";

function detailsJson(lastResult = 1): string {
  return JSON.stringify({
    installed: true,
    state: "Ready",
    enabled: true,
    homeBase64: base64(home),
    nodePathBase64: base64(nodePath),
    entryPathBase64: base64(entryPath),
    startBoundary: "2026-10-09T06:00:00",
    startWhenAvailable: true,
    runOnlyIfNetworkAvailable: true,
    logonType: "Interactive",
    lastRunAt: "2026-10-08T06:00:01.0000000+08:00",
    nextRunAt: "2026-10-09T06:00:00.0000000+08:00",
    lastResult,
  });
}

describe("queryTask", () => {
  it("从 PowerShell JSON 读取任务、路径及上次失败结果", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const exec: ExecFn = (command, args) => {
      calls.push({ command, args });
      return Promise.resolve({ ...ok, stdout: detailsJson() });
    };

    await expect(queryTask({ exec, taskName })).resolves.toEqual({
      installed: true,
      state: "Ready",
      enabled: true,
      home,
      nodePath,
      entryPath,
      startBoundary: "2026-10-09T06:00:00",
      startWhenAvailable: true,
      runOnlyIfNetworkAvailable: true,
      logonType: "Interactive",
      lastRunAt: "2026-10-08T06:00:01.0000000+08:00",
      nextRunAt: "2026-10-09T06:00:00.0000000+08:00",
      lastResult: 1,
    });
    expect(calls[0]?.command).toBe("powershell.exe");
    expect(calls[0]?.args).toContain("-Command");
    expect(calls[0]?.args.at(-1)).toContain("Get-ScheduledTaskInfo");
    expect(calls[0]?.args.at(-1)).toContain(taskName);

    const statusExec: ExecFn = () =>
      Promise.resolve({ ...ok, stdout: detailsJson() });
    await expect(
      scheduleStatus({ exec: statusExec, taskName }),
    ).resolves.toEqual({
      installed: true,
      state: "Ready",
      enabled: true,
      lastRunAt: "2026-10-08T06:00:01.0000000+08:00",
      nextRunAt: "2026-10-09T06:00:00.0000000+08:00",
      lastResult: 1,
      home,
      nodePath,
      entryPath,
    });
  });

  it("缺省状态查询按 home 生成哈希任务名", async () => {
    let query = "";
    const exec: ExecFn = (_command, args) => {
      query = args.at(-1) ?? "";
      return Promise.resolve({ ...ok, stdout: '{"installed":false}' });
    };

    await expect(scheduleStatus({ exec, home })).resolves.toEqual({
      installed: false,
    });
    expect(query).toContain(taskNameFor(home));
  });

  it("从未运行时不返回系统占位时间", async () => {
    const exec: ExecFn = () =>
      Promise.resolve({ ...ok, stdout: detailsJson(267011) });

    const result = await queryTask({ exec, taskName });
    expect(result.lastResult).toBe(267011);
    expect(result).not.toHaveProperty("lastRunAt");
  });

  it("上次运行结果是无符号 32 位数时照样解析，不溢出", async () => {
    // 0x800710E0 是「操作员或管理员拒绝了请求」，0xC000013A 是进程被 Ctrl+C 打断
    for (const code of [2147946720, 3221225786, 4294967295]) {
      const exec: ExecFn = () =>
        Promise.resolve({ ...ok, stdout: detailsJson(code) });
      await expect(queryTask({ exec, taskName })).resolves.toMatchObject({
        installed: true,
        lastResult: code,
      });
      await expect(scheduleStatus({ exec, taskName })).resolves.toMatchObject({
        lastResult: code,
      });
    }
  });

  it("查询脚本用 64 位整数取结果代码，并且只认「找不到」是没装", () => {
    const script = makeQueryScript(taskName);

    expect(script).toContain("lastResult = [long]$info.LastTaskResult");
    expect(script).not.toContain("[int]");
    expect(script).toContain("-ErrorAction Stop");
    expect(script).not.toContain("SilentlyContinue");
    expect(script).toContain("ObjectNotFound");
  });
});

describe("查询失败", () => {
  it("系统明确说没有这个任务时是没装，卸载不调用结束或删除", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const exec: ExecFn = (command, args) => {
      calls.push({ command, args });
      return Promise.resolve({ ...ok, stdout: '{"installed":false}' });
    };

    await expect(queryTask({ exec, taskName })).resolves.toEqual({
      installed: false,
    });
    await expect(removeTask({ exec, taskName })).resolves.toEqual({
      removed: false,
    });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.command === "powershell.exe")).toBe(true);
  });

  it("拒绝访问这类失败不当成没装，抛错并带上原因；卸载因此不动任何东西", async () => {
    const calls: string[] = [];
    const exec: ExecFn = (command) => {
      calls.push(command);
      return Promise.resolve(queryError("拒绝访问。"));
    };

    await expect(queryTask({ exec, taskName })).rejects.toMatchObject({
      code: "STORE_FAILED",
      message: "查询计划任务失败：拒绝访问。",
    });
    await expect(removeTask({ exec, taskName })).rejects.toMatchObject({
      message: "查询计划任务失败：拒绝访问。",
    });
    expect(calls).toEqual(["powershell.exe", "powershell.exe"]);
  });

  it("原因过长时截到 300 字以内", async () => {
    const exec: ExecFn = () =>
      Promise.resolve(queryError("很长的原因".repeat(100)));

    const error = await queryTask({ exec, taskName }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message.startsWith("查询计划任务失败：")).toBe(true);
    expect(Array.from(message.slice("查询计划任务失败：".length))).toHaveLength(
      300,
    );
  });

  it("脚本没来得及报错时：错误输出干净就用它，是乱码就只说退出码", async () => {
    const clean: ExecFn = () =>
      Promise.resolve({
        ...ok,
        exitCode: 1,
        stderr: "The service is not running.\r\n",
      });
    await expect(queryTask({ exec: clean, taskName })).rejects.toMatchObject({
      message: "查询计划任务失败：The service is not running.",
    });

    const garbled: ExecFn = () =>
      Promise.resolve({
        ...ok,
        exitCode: 1,
        stderr: `${REPLACEMENT_CHAR}: ${REPLACEMENT_CHAR}`,
      });
    await expect(queryTask({ exec: garbled, taskName })).rejects.toMatchObject({
      message: "查询计划任务失败：PowerShell 退出码 1",
    });

    const timeout: ExecFn = () =>
      Promise.resolve({ ...ok, exitCode: -1, timedOut: true });
    await expect(queryTask({ exec: timeout, taskName })).rejects.toMatchObject({
      message: "查询计划任务失败：命令超时",
    });
  });

  it("查询结果不是有效 JSON 时是内部错误", async () => {
    const exec: ExecFn = () => Promise.resolve({ ...ok, stdout: "not json" });
    await expect(queryTask({ exec, taskName })).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });
});

describe("describeLastResult", () => {
  it("把系统结果代码转成说明", () => {
    expect(describeLastResult(267011)).toBe("还没运行过");
    expect(describeLastResult(267009)).toBe("正在运行");
    expect(describeLastResult(0)).toBe("成功");
    expect(describeLastResult(1)).toBe("失败（代码 1）");
    expect(describeLastResult(undefined)).toBe("未知");
  });

  it("超过 0xFFFF 的代码用十六进制写，方便查", () => {
    expect(describeLastResult(2147946720)).toBe("失败（代码 0x800710E0）");
    expect(describeLastResult(3221225786)).toBe("失败（代码 0xC000013A）");
    expect(describeLastResult(65535)).toBe("失败（代码 65535）");
    expect(describeLastResult(65536)).toBe("失败（代码 0x10000）");
  });
});
