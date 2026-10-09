import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { runSchtasks } from "../../src/schedule/schtasks.js";
import {
  installTask,
  queryTask,
  removeTask,
} from "../../src/schedule/windows.js";
import type { ExecFn } from "../../src/shared/exec.js";
import {
  REPLACEMENT_CHAR,
  ok,
  queryError,
  schtasksArgsOf,
  schtasksResult,
} from "./support.js";

const taskName = "LeafPressDataPullTest-unit";
const flags = [
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
];

async function messageOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof Error)) throw new Error("本应抛错，却成功了");
  return error.message;
}

describe("runSchtasks", () => {
  it("在 PowerShell 里跑 schtasks，每个参数都是单引号字面量", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const exec: ExecFn = (command, args) => {
      calls.push({ command, args });
      return Promise.resolve(schtasksResult(0, "成功"));
    };

    await expect(
      runSchtasks(exec, ["/Delete", "/TN", "O'Brien’s 任务", "/F"]),
    ).resolves.toEqual({ ok: true, reason: "成功" });
    expect(calls[0]?.command).toBe("powershell.exe");
    expect(calls[0]?.args.slice(0, 6)).toEqual(flags);
    const script = calls[0]?.args.at(-1) ?? "";
    expect(script).toContain(
      "& schtasks.exe '/Delete' '/TN' 'O''Brien’’s 任务' '/F' 2>&1",
    );
    expect(script).toContain("[Convert]::ToBase64String");
  });

  it("schtasks 非 0 退出：ok 为假，原因是压成一行的原文", async () => {
    const exec: ExecFn = () =>
      Promise.resolve(
        schtasksResult(1, "错误: 系统找不到指定的文件。\n\n  (1,3):Task:\r\n"),
      );

    await expect(runSchtasks(exec, ["/End"])).resolves.toEqual({
      ok: false,
      reason: "错误: 系统找不到指定的文件。 (1,3):Task:",
    });
  });

  it("PowerShell 本身没跑成功或输出读不懂时，不抛错，把原因放进 reason", async () => {
    await expect(
      runSchtasks(
        () => Promise.resolve({ ...ok, exitCode: 1, stderr: "boom" }),
        ["/End"],
      ),
    ).resolves.toEqual({ ok: false, reason: "boom" });
    await expect(
      runSchtasks(
        () => Promise.resolve({ ...ok, stdout: "garbage" }),
        ["/End"],
      ),
    ).resolves.toEqual({ ok: false, reason: "读不懂 schtasks 的输出" });
  });
});

describe("installTask", () => {
  it("把带 BOM 的 UTF-16 LE XML 交给 schtasks /Create，用完删掉临时目录", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    let bytes: Buffer | undefined;
    let xmlPath = "";
    const exec: ExecFn = async (command, args) => {
      calls.push({ command, args });
      xmlPath = schtasksArgsOf(args)[4] ?? "";
      bytes = await readFile(xmlPath);
      return schtasksResult(0, "成功");
    };

    await installTask({ xml: "<Task>拉取 & 数据</Task>", exec, taskName });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("powershell.exe");
    expect(calls[0]?.args.slice(0, 6)).toEqual(flags);
    expect(schtasksArgsOf(calls[0]?.args ?? [])).toEqual([
      "/Create",
      "/TN",
      taskName,
      "/XML",
      expect.stringMatching(/leafpress-schedule-.*task\.xml$/u),
      "/F",
    ]);
    expect(bytes?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
    expect(bytes?.subarray(2).toString("utf16le")).toBe(
      "<Task>拉取 & 数据</Task>",
    );
    expect(existsSync(dirname(xmlPath))).toBe(false);
  });

  it("注册失败时带上系统给的原因", async () => {
    const exec: ExecFn = () =>
      Promise.resolve(
        schtasksResult(
          1,
          "错误: 任务 XML 包含来自意外命名空间的元素或属性。\n(1,3):Task:",
        ),
      );

    await expect(
      installTask({ xml: "<Task/>", exec, taskName }),
    ).rejects.toMatchObject({
      code: "STORE_FAILED",
      message:
        "注册计划任务失败：错误: 任务 XML 包含来自意外命名空间的元素或属性。 (1,3):Task:",
    });
  });

  it("原因超过 300 字时截断，且不留乱码", async () => {
    const exec: ExecFn = () =>
      Promise.resolve(schtasksResult(1, "原因".repeat(400)));

    const message = await messageOf(
      installTask({ xml: "<Task/>", exec, taskName }),
    );
    const reason = message.slice("注册计划任务失败：".length);
    expect(message.startsWith("注册计划任务失败：")).toBe(true);
    expect(Array.from(reason)).toHaveLength(300);
    expect(reason.endsWith("…")).toBe(true);
    expect(message).not.toContain(REPLACEMENT_CHAR);
  });

  it("系统没给原因时只说失败", async () => {
    const exec: ExecFn = () => Promise.resolve(schtasksResult(1, ""));

    await expect(
      installTask({ xml: "<Task/>", exec, taskName }),
    ).rejects.toMatchObject({ message: "注册计划任务失败。" });
  });
});

describe("removeTask", () => {
  function installedExec(
    calls: Array<{ command: string; args: readonly string[] }>,
    handle: (schtasksArgs: string[]) => ReturnType<typeof schtasksResult>,
  ): ExecFn {
    return (command, args) => {
      calls.push({ command, args });
      if (args.at(-1)?.includes("Get-ScheduledTaskInfo") === true)
        return Promise.resolve({
          ...ok,
          stdout: JSON.stringify({
            installed: true,
            state: "Ready",
            enabled: true,
            startWhenAvailable: true,
            runOnlyIfNetworkAvailable: true,
            lastResult: 1,
          }),
        });
      return Promise.resolve(handle(schtasksArgsOf(args)));
    };
  }

  it("查询确认已安装后按 /End、/Delete 顺序卸载，/End 失败不算错", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const exec = installedExec(calls, (schtasksArgs) =>
      schtasksArgs[0] === "/End"
        ? schtasksResult(1, "错误: 任务未运行")
        : schtasksResult(0, "成功"),
    );

    await expect(removeTask({ exec, taskName })).resolves.toEqual({
      removed: true,
    });
    expect(calls.map(({ command }) => command)).toEqual([
      "powershell.exe",
      "powershell.exe",
      "powershell.exe",
    ]);
    expect(calls[0]?.args.slice(0, 6)).toEqual(flags);
    expect(calls[0]?.args.at(-1)).toContain("Get-ScheduledTaskInfo");
    expect(schtasksArgsOf(calls[1]?.args ?? [])).toEqual([
      "/End",
      "/TN",
      taskName,
    ]);
    expect(schtasksArgsOf(calls[2]?.args ?? [])).toEqual([
      "/Delete",
      "/TN",
      taskName,
      "/F",
    ]);
  });

  it("删除失败时带上系统给的原因", async () => {
    const exec = installedExec([], (schtasksArgs) =>
      schtasksArgs[0] === "/Delete"
        ? schtasksResult(1, "错误: 拒绝访问。")
        : schtasksResult(0, "成功"),
    );

    await expect(removeTask({ exec, taskName })).rejects.toMatchObject({
      code: "STORE_FAILED",
      message: "删除计划任务失败：错误: 拒绝访问。",
    });
  });

  it("查询出错时一步都不动：不结束也不删除", async () => {
    const calls: string[] = [];
    const exec: ExecFn = (_command, args) => {
      calls.push(
        args.at(-1)?.includes("schtasks.exe") === true ? "schtasks" : "query",
      );
      return Promise.resolve(queryError("计划任务服务没有运行"));
    };

    await expect(removeTask({ exec, taskName })).rejects.toMatchObject({
      message: "查询计划任务失败：计划任务服务没有运行",
    });
    await expect(queryTask({ exec, taskName })).rejects.toBeInstanceOf(Error);
    expect(calls).not.toContain("schtasks");
  });
});
