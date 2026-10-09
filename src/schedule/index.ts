import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

import { toIsoTime } from "@leafpress/core";
import type { HomePaths } from "../config/home.js";
import { writeFileAtomic } from "../files/atomic.js";
import { LeafPressError } from "../shared/errors.js";
import type { ExecFn } from "../shared/exec.js";
import { readScheduleState, writeScheduleState } from "./state.js";
import { buildTaskXml } from "./task-xml.js";
import { buildWrapperScript } from "./wrapper.js";
import {
  installTask,
  queryTask,
  removeTask,
  type TaskStatus,
} from "./windows.js";

export type { ScheduleState } from "./state.js";
export type { TaskDetails, TaskStatus } from "./windows.js";

const DEFAULT_AT = "06:00";

export function taskNameFor(home: string): string {
  const canonicalHome = resolve(home).toLowerCase();
  const suffix = createHash("sha256")
    .update(canonicalHome)
    .digest("hex")
    .slice(0, 8);
  return `LeafPressDataPull-${suffix}`;
}

export interface InstallInput {
  paths: HomePaths;
  /** HH:mm */
  at: string;
  /** 运行 LeafPress 的 node：process.execPath */
  nodePath: string;
  /** 命令行入口的绝对路径（构建后的 dist/cli/main.js） */
  entryPath: string;
  exec: ExecFn;
  now: Date;
  env?: NodeJS.ProcessEnv;
  taskName?: string;
}

function currentUser(env: NodeJS.ProcessEnv): string {
  const domain = env["USERDOMAIN"];
  const username = env["USERNAME"];
  if (
    domain === undefined ||
    domain.length === 0 ||
    username === undefined ||
    username.length === 0
  ) {
    throw new LeafPressError("USAGE", "无法确定计划任务的当前用户。");
  }
  return `${domain}\\${username}`;
}

export async function installSchedule(
  input: InstallInput,
): Promise<{ taskName: string; at: string }> {
  const taskName = input.taskName ?? taskNameFor(input.paths.home);
  const existing = await queryTask({ exec: input.exec, taskName });
  const state = readScheduleState(input.paths, DEFAULT_AT);
  const installedAt = existing.installed
    ? (state.dataPull.installedAt ?? toIsoTime(input.now))
    : toIsoTime(input.now);
  const wrapperPath = join(input.paths.home, "schedule", "run-data-pull.ps1");
  const logsPath = join(input.paths.home, "logs");

  await mkdir(logsPath, { recursive: true });
  writeFileAtomic(
    wrapperPath,
    `\uFEFF${buildWrapperScript({
      nodePath: input.nodePath,
      entryPath: input.entryPath,
      homePath: input.paths.home,
    })}`,
  );
  const xml = buildTaskXml({
    at: input.at,
    now: input.now,
    userId: currentUser(input.env ?? process.env),
    wrapperPath,
    workingDirectory: input.paths.home,
  });
  await installTask({ xml, exec: input.exec, taskName });

  writeScheduleState(input.paths, {
    version: 1,
    dataPull: {
      ...state.dataPull,
      installed: true,
      at: input.at,
      installedAt,
    },
  });
  return { taskName, at: input.at };
}

export async function removeSchedule(input: {
  paths: HomePaths;
  exec: ExecFn;
  taskName?: string;
}): Promise<{ removed: boolean }> {
  const taskName = input.taskName ?? taskNameFor(input.paths.home);
  const result = await removeTask({ exec: input.exec, taskName });
  await rm(join(input.paths.home, "schedule", "run-data-pull.ps1"), {
    force: true,
  });
  const state = readScheduleState(input.paths, DEFAULT_AT);
  writeScheduleState(input.paths, {
    version: 1,
    dataPull: { ...state.dataPull, installed: false },
  });
  return result;
}

export type ScheduleStatusInput =
  | { exec: ExecFn; taskName: string }
  | { exec: ExecFn; home: string; taskName?: string }
  | { exec: ExecFn; paths: HomePaths; taskName?: string };

export async function scheduleStatus(
  input: ScheduleStatusInput,
): Promise<TaskStatus> {
  const home =
    "home" in input
      ? input.home
      : "paths" in input
        ? input.paths.home
        : undefined;
  const taskName =
    input.taskName ?? (home === undefined ? undefined : taskNameFor(home));
  if (taskName === undefined) {
    throw new LeafPressError(
      "USAGE",
      "查询计划任务时必须提供 taskName 或 home。",
    );
  }
  const details = await queryTask({ exec: input.exec, taskName });
  const {
    installed,
    state,
    enabled,
    lastRunAt,
    nextRunAt,
    lastResult,
    home: taskHome,
    nodePath,
    entryPath,
  } = details;
  return {
    installed,
    ...(state === undefined ? {} : { state }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(lastRunAt === undefined ? {} : { lastRunAt }),
    ...(nextRunAt === undefined ? {} : { nextRunAt }),
    ...(lastResult === undefined ? {} : { lastResult }),
    ...(taskHome === undefined ? {} : { home: taskHome }),
    ...(nodePath === undefined ? {} : { nodePath }),
    ...(entryPath === undefined ? {} : { entryPath }),
  };
}

export function describeLastResult(code: number | undefined): string {
  if (code === undefined) return "未知";
  if (code === 267011) return "还没运行过";
  if (code === 267009) return "正在运行";
  if (code === 0) return "成功";
  // 超过 0xFFFF 的是系统的错误码（如 0x800710E0、0xC000013A），用十六进制写才查得到；
  // 小的是程序自己的退出码，十进制就是它本来的样子
  if (code > 0xffff) return `失败（代码 0x${code.toString(16).toUpperCase()}）`;
  return `失败（代码 ${code}）`;
}
