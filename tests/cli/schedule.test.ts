import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { describeLastResult, taskNameFor } from "../../src/schedule/index.js";
import {
  executeScheduleInstall,
  renderScheduleInstall,
  run as runSchedule,
  type ScheduleApi,
} from "../../src/cli/commands/schedule.js";
import { LeafPressError } from "../../src/shared/errors.js";
import type { ExecFn } from "../../src/shared/exec.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function setup(platform: NodeJS.Platform = "win32") {
  tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-schedule-"));
  const home = join(tempDir, "home");
  const context = createCliContext(
    { home },
    {
      env: { USERDOMAIN: "WORKGROUP", USERNAME: "tester" },
      homedir: tempDir,
      platform,
    },
  );
  const exec = vi.fn<ExecFn>(() =>
    Promise.resolve({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    }),
  );
  const stored = {
    version: 1 as const,
    dataPull: {
      installed: true,
      at: "06:30",
      lastRunAt: "2026-10-08T22:00:00.000Z",
      lastResult: "failed" as const,
      lastNote: "知乎账号：令牌过期",
    },
  };
  const installSchedule = vi.fn(
    (input: Parameters<ScheduleApi["installSchedule"]>[0]) =>
      input.exec("fake-schtasks.exe", ["/Create"]).then(() => ({
        taskName: input.taskName ?? "fake-task",
        at: input.at,
      })),
  );
  const removeSchedule = vi.fn(
    (input: Parameters<ScheduleApi["removeSchedule"]>[0]) =>
      input.exec("fake-schtasks.exe", ["/Delete"]).then(() => ({
        removed: true,
      })),
  );
  const scheduleStatus = vi.fn<ScheduleApi["scheduleStatus"]>((input) =>
    input.exec("fake-powershell.exe", ["-Command"]).then(() => ({
      installed: true,
      enabled: true,
      state: "Ready",
      home,
      nodePath: process.execPath,
      entryPath: resolve(process.cwd(), "dist/cli/main.js"),
      lastRunAt: "2026-10-08T22:00:00.000Z",
      nextRunAt: "2026-10-10T06:30:00+08:00",
      lastResult: 267009,
    })),
  );
  const api: ScheduleApi = {
    taskNameFor: vi.fn(taskNameFor),
    describeLastResult: vi.fn(describeLastResult),
    installSchedule,
    removeSchedule,
    scheduleStatus,
    readScheduleState: vi.fn(() => stored),
  };
  return {
    context,
    api,
    exec,
    stored,
    installSchedule,
    removeSchedule,
    scheduleStatus,
    dependencies: {
      scheduleModule: vi.fn(() => Promise.resolve(api)),
      exec,
      platform,
      // 默认入口 dist/cli/main.js 要先构建才有；单测不依赖构建产物，所以这里假装文件都在
      fileExists: () => true,
      now: () => new Date("2026-10-09T12:00:00.000Z"),
    },
  };
}

async function capture(run: () => Promise<void>) {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  };
  try {
    await run();
    return { stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("leafpress schedule", () => {
  it("install 使用配置默认时间、当前 node 和绝对构建入口", async () => {
    const { context, exec, dependencies, installSchedule } = await setup();
    const result = await executeScheduleInstall(
      context,
      undefined,
      dependencies,
    );
    expect(result).toEqual({
      taskName: taskNameFor(context.paths.home),
      at: "06:00",
      installed: true,
    });
    expect(installSchedule.mock.calls[0]?.[0]).toMatchObject({
      paths: context.paths,
      at: "06:00",
      nodePath: process.execPath,
      entryPath: resolve(process.cwd(), "dist/cli/main.js"),
      exec,
      now: new Date("2026-10-09T12:00:00.000Z"),
      env: context.env,
      taskName: taskNameFor(context.paths.home),
    });
    expect(exec).toHaveBeenCalledWith("fake-schtasks.exe", ["/Create"]);
    expect(renderScheduleInstall(result)).toBe(
      "已装上：每天 06:00 拉一次数据（只在你登录时运行，错过的在登录后补跑）",
    );
  });

  it("逐行输出安装、卸载和状态，并保留系统删除提示", async () => {
    const { context, exec, dependencies, removeSchedule, scheduleStatus } =
      await setup();
    const installOutput = await capture(() =>
      runSchedule(context, ["install", { at: "23:59" }], dependencies),
    );
    expect(installOutput.stdout.trimEnd().split("\n")).toEqual([
      "已装上：每天 23:59 拉一次数据（只在你登录时运行，错过的在登录后补跑）",
    ]);

    const removeOutput = await capture(() =>
      runSchedule(context, ["remove"], dependencies),
    );
    expect(removeOutput.stdout.split("\n")).toEqual(["已卸下", ""]);
    expect(removeSchedule.mock.calls[0]?.[0]).toEqual({
      paths: context.paths,
      exec,
      taskName: taskNameFor(context.paths.home),
    });

    const statusOutput = await capture(() =>
      runSchedule(context, ["status"], dependencies),
    );
    expect(statusOutput.stdout.split("\n")).toEqual([
      "是否安装：已安装",
      "是否启用：是",
      "每天：06:30",
      "系统状态：Ready",
      "下次运行：2026-10-10T06:30:00+08:00",
      "系统上次运行：2026-10-08T22:00:00.000Z",
      "系统上次结果：正在运行",
      "最近一次定时拉取：失败",
      "说明：知乎账号：令牌过期",
      "",
    ]);
    expect(scheduleStatus.mock.calls[0]?.[0]).toMatchObject({
      exec,
      taskName: taskNameFor(context.paths.home),
    });
    expect(exec).toHaveBeenCalledWith("fake-powershell.exe", ["-Command"]);
  });

  it("JSON 输出结构化结果，remove 未安装时逐行显示没有装", async () => {
    const { context, dependencies, removeSchedule, scheduleStatus } =
      await setup();
    const jsonContext = createCliContext(
      { home: context.home, json: true },
      {
        env: context.env,
        homedir: context.homedir,
        platform: "win32",
      },
    );
    const output = await capture(() =>
      runSchedule(jsonContext, ["install", { at: "07:15" }], dependencies),
    );
    expect(JSON.parse(output.stdout)).toEqual({
      ok: true,
      taskName: taskNameFor(context.paths.home),
      at: "07:15",
      installed: true,
    });
    removeSchedule.mockResolvedValue({ removed: false });
    const removedOutput = await capture(() =>
      runSchedule(context, ["remove"], dependencies),
    );
    expect(removedOutput.stdout.split("\n")).toEqual(["没有装", ""]);

    scheduleStatus.mockResolvedValue({ installed: false, lastResult: 267011 });
    const statusOutput = await capture(() =>
      runSchedule(jsonContext, ["status"], dependencies),
    );
    expect(JSON.parse(statusOutput.stdout)).toEqual({
      ok: true,
      taskName: taskNameFor(context.paths.home),
      installed: false,
      enabled: null,
      home: null,
      nodePath: null,
      entryPath: null,
      at: "06:30",
      state: null,
      nextRunAt: null,
      systemLastRunAt: null,
      systemLastResult: 267011,
      systemLastResultDescription: "还没运行过",
      lastRunAt: "2026-10-08T22:00:00.000Z",
      lastResult: "failed",
      lastNote: "知乎账号：令牌过期",
      warning: "计划任务被删了，运行 leafpress schedule install 重新装",
    });
  });

  it("非 Windows 和非法时间为 USAGE，且不加载计划任务模块", async () => {
    const { context, dependencies } = await setup("linux");
    await expect(
      executeScheduleInstall(context, undefined, dependencies),
    ).rejects.toMatchObject({
      code: "USAGE",
      message: "定时拉数据目前只支持 Windows",
    });
    expect(dependencies.scheduleModule).not.toHaveBeenCalled();

    const windows = await setup("win32");
    await expect(
      executeScheduleInstall(windows.context, "25:00", windows.dependencies),
    ).rejects.toBeInstanceOf(LeafPressError);
    expect(windows.installSchedule.mock.calls).toHaveLength(0);
  });
});
