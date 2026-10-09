import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { homePaths } from "../../src/config/home.js";
import {
  installSchedule,
  removeSchedule,
  taskNameFor,
} from "../../src/schedule/index.js";
import {
  readScheduleState,
  writeScheduleState,
} from "../../src/schedule/state.js";
import type { ExecFn, ExecResult } from "../../src/shared/exec.js";
import { ok, queryError, schtasksArgsOf, schtasksResult } from "./support.js";

let home = "";

afterEach(async () => {
  if (home !== "") await rm(home, { recursive: true, force: true });
  home = "";
});

function missingTask(): ExecResult {
  return { ...ok, stdout: '{"installed":false}' };
}

/** schtasks 是经 PowerShell 调的：脚本里有 `& schtasks.exe` 的是注册或删除，其余是查询 */
function isSchtasksCall(args: readonly string[]): boolean {
  return args.at(-1)?.includes("& schtasks.exe") === true;
}

describe("schedule lifecycle", () => {
  it("按绝对路径小写 SHA-256 前八位生成稳定任务名", () => {
    const homePath = resolve("C:/LeafPress/Data");
    const suffix = createHash("sha256")
      .update(homePath.toLowerCase())
      .digest("hex")
      .slice(0, 8);

    expect(taskNameFor(homePath)).toBe(`LeafPressDataPull-${suffix}`);
    expect(taskNameFor("C:/LEAFPRESS/DATA")).toBe(taskNameFor(homePath));
    expect(taskNameFor(resolve("C:/LeafPress/Other"))).not.toBe(
      taskNameFor(homePath),
    );
  });

  it("按系统查询结果注册哈希任务并写入 BOM 启动脚本和状态", async () => {
    home = await mkdtemp(join(tmpdir(), "leafpress-schedule-install-"));
    const paths = homePaths(home);
    let xml = "";
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const exec: ExecFn = async (command, args) => {
      calls.push({ command, args });
      if (!isSchtasksCall(args)) return missingTask();
      const xmlPath = schtasksArgsOf(args)[4];
      if (xmlPath === undefined) throw new Error("missing XML path");
      const bytes = await readFile(xmlPath);
      xml = bytes.subarray(2).toString("utf16le");
      return schtasksResult(0, "成功");
    };

    const result = await installSchedule({
      paths,
      at: "06:20",
      nodePath: "C:\\Program Files\\node.exe",
      entryPath: "C:\\LeafPress\\dist\\cli\\main.js",
      exec,
      now: new Date(2026, 9, 9, 8, 0, 0),
      env: { USERDOMAIN: "TEST-DOMAIN", USERNAME: "test-user" },
    });

    expect(result).toEqual({ taskName: taskNameFor(home), at: "06:20" });
    expect(calls[0]?.command).toBe("powershell.exe");
    expect(isSchtasksCall(calls[0]?.args ?? [])).toBe(false);
    expect(schtasksArgsOf(calls[1]?.args ?? []).slice(0, 4)).toEqual([
      "/Create",
      "/TN",
      taskNameFor(home),
      "/XML",
    ]);
    expect(xml).toContain("<UserId>TEST-DOMAIN\\test-user</UserId>");
    expect(xml).toContain(
      `<Description>LeafPress 每天拉作品数据（数据目录：${home}）</Description>`,
    );

    const wrapperPath = join(home, "schedule", "run-data-pull.ps1");
    const wrapper = await readFile(wrapperPath);
    expect(wrapper.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(wrapper.toString("utf8")).toContain("data pull --scheduled --home");
    expect(wrapper.toString("utf8")).toContain(
      join(home, "logs", "data-pull.out.log"),
    );
    expect(wrapper.toString("utf8")).toContain(
      join(home, "logs", "data-pull.err.log"),
    );
    await expect(readdir(join(home, "logs"))).resolves.toEqual([]);
    expect(readScheduleState(paths, "07:00")).toEqual({
      version: 1,
      dataPull: {
        installed: true,
        at: "06:20",
        installedAt: "2026-10-09T08:00:00+08:00",
      },
    });
  });

  it("按系统查询判断卸载，并依序结束、删除、移除脚本、更新状态", async () => {
    home = await mkdtemp(join(tmpdir(), "leafpress-schedule-remove-"));
    const paths = homePaths(home);
    const wrapperPath = join(home, "schedule", "run-data-pull.ps1");
    writeScheduleState(paths, {
      version: 1,
      dataPull: {
        installed: true,
        at: "05:30",
        installedAt: "2026-10-09T08:00:00+08:00",
      },
    });
    await mkdir(join(home, "schedule"), { recursive: true });
    await writeFile(wrapperPath, "script", "utf8");
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const exec: ExecFn = (command, args) => {
      calls.push({ command, args });
      if (!isSchtasksCall(args))
        return Promise.resolve({
          ...ok,
          stdout: JSON.stringify({
            installed: true,
            state: "Ready",
            enabled: true,
            startBoundary: "2026-10-10T05:30:00",
            startWhenAvailable: true,
            runOnlyIfNetworkAvailable: true,
            lastResult: 267011,
          }),
        });
      if (schtasksArgsOf(args)[0] === "/End")
        return Promise.resolve(schtasksResult(1, "错误: 任务未运行"));
      return Promise.resolve(schtasksResult(0, "成功"));
    };

    await expect(
      removeSchedule({ paths, exec, taskName: "LeafPressDataPullTest-remove" }),
    ).resolves.toEqual({ removed: true });
    expect(calls).toHaveLength(3);
    expect(calls.map(({ command }) => command)).toEqual([
      "powershell.exe",
      "powershell.exe",
      "powershell.exe",
    ]);
    expect(calls[0]?.args.at(-1)).toContain("Get-ScheduledTaskInfo");
    expect(schtasksArgsOf(calls[1]?.args ?? [])).toEqual([
      "/End",
      "/TN",
      "LeafPressDataPullTest-remove",
    ]);
    expect(schtasksArgsOf(calls[2]?.args ?? [])).toEqual([
      "/Delete",
      "/TN",
      "LeafPressDataPullTest-remove",
      "/F",
    ]);
    await expect(readFile(wrapperPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(readScheduleState(paths, "07:00")).toEqual({
      version: 1,
      dataPull: {
        installed: false,
        at: "05:30",
        installedAt: "2026-10-09T08:00:00+08:00",
      },
    });
  });

  it("查询计划任务失败时，卸载什么都不动：启动脚本和状态都保留，错误带原因", async () => {
    home = await mkdtemp(join(tmpdir(), "leafpress-schedule-denied-"));
    const paths = homePaths(home);
    const wrapperPath = join(home, "schedule", "run-data-pull.ps1");
    const state = {
      version: 1 as const,
      dataPull: {
        installed: true,
        at: "05:30",
        installedAt: "2026-10-09T08:00:00+08:00",
      },
    };
    writeScheduleState(paths, state);
    await mkdir(join(home, "schedule"), { recursive: true });
    await writeFile(wrapperPath, "script", "utf8");
    const exec: ExecFn = () => Promise.resolve(queryError("拒绝访问。"));

    await expect(removeSchedule({ paths, exec })).rejects.toMatchObject({
      message: "查询计划任务失败：拒绝访问。",
    });
    await expect(readFile(wrapperPath, "utf8")).resolves.toBe("script");
    expect(readScheduleState(paths, "07:00")).toEqual(state);
  });

  it("查询计划任务失败时，安装不写启动脚本也不改状态", async () => {
    home = await mkdtemp(join(tmpdir(), "leafpress-schedule-install-denied-"));
    const paths = homePaths(home);
    const exec: ExecFn = () => Promise.resolve(queryError("拒绝访问。"));

    await expect(
      installSchedule({
        paths,
        at: "06:00",
        nodePath: "C:\\node.exe",
        entryPath: "C:\\main.js",
        exec,
        now: new Date(2026, 9, 9, 8, 0, 0),
        env: { USERDOMAIN: "TEST-DOMAIN", USERNAME: "test-user" },
      }),
    ).rejects.toMatchObject({ message: "查询计划任务失败：拒绝访问。" });
    await expect(
      readFile(join(home, "schedule", "run-data-pull.ps1")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(readScheduleState(paths, "06:00").dataPull.installed).toBe(false);
  });

  it("系统确认不存在时仍清理脚本和状态但不伪报已卸载", async () => {
    home = await mkdtemp(join(tmpdir(), "leafpress-schedule-missing-"));
    const paths = homePaths(home);
    const exec: ExecFn = () => Promise.resolve(missingTask());

    await expect(removeSchedule({ paths, exec })).resolves.toEqual({
      removed: false,
    });
    expect(readScheduleState(paths, "07:00")).toEqual({
      version: 1,
      dataPull: { installed: false, at: "06:00" },
    });
  });
});
