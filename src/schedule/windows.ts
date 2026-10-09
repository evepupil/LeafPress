import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IsoTime } from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import type { ExecFn } from "../shared/exec.js";
import {
  describeFailure,
  failureMessage,
  powershellArgs,
} from "./powershell.js";
import { makeQueryScript } from "./query-script.js";
import { runSchtasks } from "./schtasks.js";

export interface TaskStatus {
  installed: boolean;
  /** Ready、Running、Disabled…（系统给的英文值） */
  state?: string;
  enabled?: boolean;
  /** 从未运行时系统时间为 1999-11-30，省略该字段 */
  lastRunAt?: IsoTime;
  nextRunAt?: IsoTime;
  /** 上次运行的系统结果代码：无符号 32 位数，可以大于 2^31（如 0x800710E0 即 2147946720） */
  lastResult?: number;
  home?: string;
  nodePath?: string;
  entryPath?: string;
}

export interface TaskDetails extends TaskStatus {
  startBoundary?: string;
  startWhenAvailable?: boolean;
  runOnlyIfNetworkAvailable?: boolean;
  logonType?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string")
    throw new LeafPressError("INTERNAL", "计划任务查询结果格式无效。");
  return value;
}

function optionalBase64String(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = optionalString(source, key);
  if (value === undefined) return undefined;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    throw new LeafPressError("INTERNAL", "计划任务查询结果格式无效。");
  }
}

function parseTaskDetails(stdout: string): TaskDetails {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim()) as unknown;
  } catch {
    throw new LeafPressError("INTERNAL", "计划任务查询结果不是有效 JSON。");
  }
  if (!record(value) || typeof value["installed"] !== "boolean") {
    throw new LeafPressError("INTERNAL", "计划任务查询结果格式无效。");
  }
  if (!value["installed"]) return { installed: false };
  if (
    typeof value["state"] !== "string" ||
    typeof value["enabled"] !== "boolean" ||
    typeof value["lastResult"] !== "number"
  ) {
    throw new LeafPressError("INTERNAL", "计划任务查询结果格式无效。");
  }
  if (
    typeof value["startWhenAvailable"] !== "boolean" ||
    typeof value["runOnlyIfNetworkAvailable"] !== "boolean"
  ) {
    throw new LeafPressError("INTERNAL", "计划任务查询结果格式无效。");
  }

  const lastResult = value["lastResult"];
  const lastRunAt =
    lastResult === 267011 ? undefined : optionalString(value, "lastRunAt");
  const startBoundary = optionalString(value, "startBoundary");
  const logonType = optionalString(value, "logonType");
  const nextRunAt = optionalString(value, "nextRunAt");
  const home = optionalBase64String(value, "homeBase64");
  const nodePath = optionalBase64String(value, "nodePathBase64");
  const entryPath = optionalBase64String(value, "entryPathBase64");
  return {
    installed: true,
    state: value["state"],
    enabled: value["enabled"],
    startWhenAvailable: value["startWhenAvailable"],
    runOnlyIfNetworkAvailable: value["runOnlyIfNetworkAvailable"],
    lastResult,
    ...(startBoundary === undefined ? {} : { startBoundary }),
    ...(logonType === undefined ? {} : { logonType }),
    ...(lastRunAt === undefined ? {} : { lastRunAt }),
    ...(nextRunAt === undefined ? {} : { nextRunAt }),
    ...(home === undefined ? {} : { home }),
    ...(nodePath === undefined ? {} : { nodePath }),
    ...(entryPath === undefined ? {} : { entryPath }),
  };
}

export async function installTask(input: {
  xml: string;
  exec: ExecFn;
  taskName: string;
}): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-schedule-"));
  const xmlPath = join(directory, "task.xml");
  try {
    const encoded = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(input.xml, "utf16le"),
    ]);
    await writeFile(xmlPath, encoded);
    const outcome = await runSchtasks(input.exec, [
      "/Create",
      "/TN",
      input.taskName,
      "/XML",
      xmlPath,
      "/F",
    ]);
    if (!outcome.ok)
      throw new LeafPressError(
        "STORE_FAILED",
        failureMessage("注册计划任务失败", outcome.reason),
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * 查任务。只有系统明确说「没有这个任务」才返回 { installed: false }；
 * 其他任何失败（拒绝访问、计划任务服务没起来……）都抛错并带上原因，
 * 不能当成没装，否则卸载时会在任务还在的情况下清掉启动脚本和状态。
 */
export async function queryTask(input: {
  exec: ExecFn;
  taskName: string;
}): Promise<TaskDetails> {
  const result = await input.exec(
    "powershell.exe",
    powershellArgs(makeQueryScript(input.taskName)),
  );
  if (result.timedOut || result.exitCode !== 0)
    throw new LeafPressError(
      "STORE_FAILED",
      failureMessage("查询计划任务失败", describeFailure(result)),
    );
  return parseTaskDetails(result.stdout);
}

export async function removeTask(input: {
  exec: ExecFn;
  taskName: string;
}): Promise<{ removed: boolean }> {
  const status = await queryTask(input);
  if (!status.installed) return { removed: false };

  // 先结束正在跑的这次。任务没在跑时 /End 会报错，这是正常的，所以不看它的结果
  await runSchtasks(input.exec, ["/End", "/TN", input.taskName]);
  const deletion = await runSchtasks(input.exec, [
    "/Delete",
    "/TN",
    input.taskName,
    "/F",
  ]);
  if (!deletion.ok)
    throw new LeafPressError(
      "STORE_FAILED",
      failureMessage("删除计划任务失败", deletion.reason),
    );
  return { removed: true };
}
