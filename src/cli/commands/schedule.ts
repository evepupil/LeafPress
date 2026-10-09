import { statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HomePaths } from "../../config/home.js";
import type { ScheduleState, TaskStatus } from "../../schedule/index.js";
import { LeafPressError } from "../../shared/errors.js";
import { execCommand, type ExecFn } from "../../shared/exec.js";
import type { CliContext } from "../context.js";
import { commandOptions, emitSuccess } from "./shared.js";

export interface ScheduleApi {
  taskNameFor(home: string): string;
  describeLastResult(code: number | undefined): string;
  installSchedule(input: {
    paths: HomePaths;
    at: string;
    nodePath: string;
    entryPath: string;
    exec: ExecFn;
    now: Date;
    env?: NodeJS.ProcessEnv;
    taskName?: string;
  }): Promise<{ taskName: string; at: string }>;
  removeSchedule(input: {
    paths: HomePaths;
    exec: ExecFn;
    taskName?: string;
  }): Promise<{ removed: boolean }>;
  scheduleStatus(input: {
    exec: ExecFn;
    taskName: string;
  }): Promise<TaskStatus>;
  readScheduleState(paths: HomePaths, defaultAt: string): ScheduleState;
}

export interface ScheduleCommandDependencies {
  scheduleModule?: () => Promise<ScheduleApi>;
  exec?: ExecFn;
  platform?: NodeJS.Platform;
  nodePath?: string;
  entryPath?: string;
  /** 判断文件在不在；缺省查真实文件系统，测试里换成假的 */
  fileExists?: (path: string) => boolean;
  now?: () => Date;
}

export interface ScheduleStatusResult {
  taskName: string;
  installed: boolean;
  enabled: boolean | null;
  home: string | null;
  nodePath: string | null;
  entryPath: string | null;
  at: string;
  state: string | null;
  nextRunAt: string | null;
  systemLastRunAt: string | null;
  systemLastResult: number | null;
  systemLastResultDescription: string;
  lastRunAt: string | null;
  lastResult: "ok" | "failed" | null;
  lastNote: string | null;
  warning: string | null;
}

async function defaultScheduleApi(): Promise<ScheduleApi> {
  const [schedule, state] = await Promise.all([
    import("../../schedule/index.js"),
    import("../../schedule/state.js"),
  ]);
  return { ...schedule, readScheduleState: state.readScheduleState };
}

async function getScheduleApi(
  dependencies: ScheduleCommandDependencies,
): Promise<ScheduleApi> {
  return dependencies.scheduleModule === undefined
    ? defaultScheduleApi()
    : dependencies.scheduleModule();
}

function ensureWindows(platform: NodeJS.Platform): void {
  if (platform !== "win32")
    throw new LeafPressError("USAGE", "定时拉数据目前只支持 Windows");
}

function validateTime(at: string): void {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(at))
    throw new LeafPressError("USAGE", "计划时间必须是 HH:mm 格式。");
}

function defaultAt(state: ScheduleState, fallback: string): string {
  return state.dataPull.at || fallback;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * 装之前确认计划任务要跑的两个文件都在。
 * 没构建过的源码目录里命令行入口还不存在，这时装上会提示「已装上」，
 * 之后每天定时都失败，所以不注册，直接告诉作者先构建。
 */
function ensureRunnable(
  nodePath: string,
  entryPath: string,
  fileExists: (path: string) => boolean,
): void {
  if (!fileExists(entryPath))
    throw new LeafPressError(
      "USAGE",
      `找不到命令行入口 ${entryPath}：先运行 pnpm build 再装`,
    );
  if (!fileExists(nodePath))
    throw new LeafPressError(
      "USAGE",
      `找不到 node 程序 ${nodePath}：请确认 Node.js 已安装，再重新装`,
    );
}

export async function executeScheduleInstall(
  context: CliContext,
  requestedAt: string | undefined,
  dependencies: ScheduleCommandDependencies = {},
): Promise<{ taskName: string; at: string; installed: true }> {
  ensureWindows(dependencies.platform ?? context.platform);
  const at = requestedAt ?? (await context.getConfig()).schedule.dataPullAt;
  validateTime(at);
  const nodePath = dependencies.nodePath ?? process.execPath;
  const entryPath =
    dependencies.entryPath ??
    resolve(
      fileURLToPath(new URL("../../../dist/cli/main.js", import.meta.url)),
    );
  ensureRunnable(nodePath, entryPath, dependencies.fileExists ?? isFile);
  const api = await getScheduleApi(dependencies);
  const taskName = api.taskNameFor(context.paths.home);
  const result = await api.installSchedule({
    paths: context.paths,
    at,
    nodePath,
    entryPath,
    exec: dependencies.exec ?? context.exec ?? execCommand,
    now: dependencies.now?.() ?? new Date(),
    env: context.env,
    taskName,
  });
  return { ...result, installed: true };
}

export async function executeScheduleRemove(
  context: CliContext,
  dependencies: ScheduleCommandDependencies = {},
): Promise<{ removed: boolean }> {
  ensureWindows(dependencies.platform ?? context.platform);
  const api = await getScheduleApi(dependencies);
  return api.removeSchedule({
    paths: context.paths,
    exec: dependencies.exec ?? context.exec ?? execCommand,
    taskName: api.taskNameFor(context.paths.home),
  });
}

export async function executeScheduleStatus(
  context: CliContext,
  dependencies: ScheduleCommandDependencies = {},
): Promise<ScheduleStatusResult> {
  const api = await getScheduleApi(dependencies);
  const config = await context.getConfig();
  const stored = api.readScheduleState(
    context.paths,
    config.schedule.dataPullAt,
  );
  const platform = dependencies.platform ?? context.platform;
  const taskName = api.taskNameFor(context.paths.home);
  const task: TaskStatus =
    platform === "win32"
      ? await api.scheduleStatus({
          exec: dependencies.exec ?? context.exec ?? execCommand,
          taskName,
        })
      : { installed: false };
  const warning =
    stored.dataPull.installed && !task.installed
      ? "计划任务被删了，运行 leafpress schedule install 重新装"
      : null;
  return {
    taskName,
    installed: task.installed,
    enabled: task.enabled ?? null,
    home: task.home ?? null,
    nodePath: task.nodePath ?? null,
    entryPath: task.entryPath ?? null,
    at: defaultAt(stored, config.schedule.dataPullAt),
    state: task.state ?? null,
    nextRunAt: task.nextRunAt ?? null,
    systemLastRunAt: task.lastRunAt ?? null,
    systemLastResult: task.lastResult ?? null,
    systemLastResultDescription: api.describeLastResult(task.lastResult),
    lastRunAt: stored.dataPull.lastRunAt ?? null,
    lastResult: stored.dataPull.lastResult ?? null,
    lastNote: stored.dataPull.lastNote ?? null,
    warning,
  };
}

function renderScheduleStatus(result: ScheduleStatusResult): string {
  const lines = [
    `是否安装：${result.installed ? "已安装" : "未安装"}`,
    `是否启用：${result.enabled === null ? "未知" : result.enabled ? "是" : "否"}`,
    `每天：${result.at}`,
    `系统状态：${result.state ?? "未注册"}`,
    `下次运行：${result.nextRunAt ?? "未知"}`,
    `系统上次运行：${result.systemLastRunAt ?? "从未运行"}`,
    `系统上次结果：${result.systemLastResultDescription}`,
    `最近一次定时拉取：${result.lastResult === null ? "从未运行" : result.lastResult === "ok" ? "成功" : "失败"}`,
    `说明：${result.lastNote ?? "—"}`,
  ];
  if (result.warning !== null) lines.push(result.warning);
  return lines.join("\n");
}

export function renderScheduleInstall(result: {
  taskName: string;
  at: string;
  installed: true;
}): string {
  return `已装上：每天 ${result.at} 拉一次数据（只在你登录时运行，错过的在登录后补跑）`;
}

export function renderScheduleRemove(result: { removed: boolean }): string {
  return result.removed ? "已卸下" : "没有装";
}

export function renderScheduleResult(result: ScheduleStatusResult): string {
  return renderScheduleStatus(result);
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
  dependencies: ScheduleCommandDependencies = {},
): Promise<void> {
  const operation = args[0];
  const options = commandOptions(args.slice(1));
  if (operation === "install") {
    const at = typeof options["at"] === "string" ? options["at"] : undefined;
    const result = await executeScheduleInstall(context, at, dependencies);
    emitSuccess(context, result, renderScheduleInstall(result));
    return;
  }
  if (operation === "remove") {
    const result = await executeScheduleRemove(context, dependencies);
    emitSuccess(context, result, renderScheduleRemove(result));
    return;
  }
  if (operation === "status") {
    const result = await executeScheduleStatus(context, dependencies);
    emitSuccess(context, result, renderScheduleResult(result));
    return;
  }
  throw new LeafPressError(
    "USAGE",
    "请指定 schedule install、remove 或 status。",
  );
}
