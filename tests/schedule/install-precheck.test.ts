import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executeScheduleInstall,
  type ScheduleApi,
  type ScheduleCommandDependencies,
} from "../../src/cli/commands/schedule.js";
import { createCliContext } from "../../src/cli/context.js";
import { describeLastResult, taskNameFor } from "../../src/schedule/index.js";
import type { ExecFn } from "../../src/shared/exec.js";
import { ok } from "./support.js";

let directory = "";
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function setup() {
  directory = await mkdtemp(join(tmpdir(), "leafpress-install-precheck-"));
  const context = createCliContext(
    { home: join(directory, "home") },
    {
      env: { USERDOMAIN: "WORKGROUP", USERNAME: "tester" },
      homedir: directory,
      platform: "win32",
    },
  );
  const installSchedule = vi.fn(
    (input: Parameters<ScheduleApi["installSchedule"]>[0]) =>
      Promise.resolve({ taskName: input.taskName ?? "task", at: input.at }),
  );
  const api: ScheduleApi = {
    taskNameFor,
    describeLastResult,
    installSchedule,
    removeSchedule: vi.fn(() => Promise.resolve({ removed: true })),
    scheduleStatus: vi.fn(() => Promise.resolve({ installed: false })),
    readScheduleState: vi.fn(() => ({
      version: 1 as const,
      dataPull: { installed: false, at: "06:00" },
    })),
  };
  const scheduleModule = vi.fn(() => Promise.resolve(api));
  // 不带 fileExists：命令用默认的真实文件系统检查
  const realFiles = (
    nodePath: string,
    entryPath: string,
  ): ScheduleCommandDependencies => ({
    scheduleModule,
    exec: vi.fn<ExecFn>(() => Promise.resolve(ok)),
    platform: "win32",
    now: () => new Date("2026-10-09T12:00:00.000Z"),
    nodePath,
    entryPath,
  });
  return { context, installSchedule, scheduleModule, realFiles };
}

describe("schedule install 装之前先确认入口和 node 都在", () => {
  it("命令行入口不在（没构建过）：报用法错误并提示先构建，不注册", async () => {
    const { context, installSchedule, scheduleModule, realFiles } =
      await setup();
    // 不存在的路径，以及一个存在但是目录的路径，都不算入口文件
    for (const entryPath of [join(directory, "dist", "main.js"), directory]) {
      await expect(
        executeScheduleInstall(
          context,
          undefined,
          realFiles(process.execPath, entryPath),
        ),
      ).rejects.toMatchObject({
        code: "USAGE",
        message: `找不到命令行入口 ${entryPath}：先运行 pnpm build 再装`,
      });
    }
    expect(installSchedule).not.toHaveBeenCalled();
    expect(scheduleModule).not.toHaveBeenCalled();
  });

  it("没传入口时按默认的构建产物位置检查，没构建过就提示", async () => {
    const { context, installSchedule } = await setup();

    await expect(
      executeScheduleInstall(context, undefined, {
        platform: "win32",
        fileExists: () => false,
      }),
    ).rejects.toMatchObject({
      code: "USAGE",
      message: `找不到命令行入口 ${resolve(process.cwd(), "dist/cli/main.js")}：先运行 pnpm build 再装`,
    });
    expect(installSchedule).not.toHaveBeenCalled();
  });

  it("node 不在：同样报用法错误，不注册；node 在了才照常注册", async () => {
    const { context, installSchedule, realFiles } = await setup();
    const entryPath = join(directory, "main.js");
    await writeFile(entryPath, "", "utf8");
    const nodePath = join(directory, "no-node", "node.exe");

    await expect(
      executeScheduleInstall(
        context,
        undefined,
        realFiles(nodePath, entryPath),
      ),
    ).rejects.toMatchObject({
      code: "USAGE",
      message: `找不到 node 程序 ${nodePath}：请确认 Node.js 已安装，再重新装`,
    });
    expect(installSchedule).not.toHaveBeenCalled();

    await expect(
      executeScheduleInstall(
        context,
        "07:30",
        realFiles(process.execPath, entryPath),
      ),
    ).resolves.toMatchObject({ at: "07:30", installed: true });
    expect(installSchedule.mock.calls[0]?.[0]).toMatchObject({
      nodePath: process.execPath,
      entryPath,
    });
  });
});
