import {
  chmodSync,
  closeSync,
  copyFileSync,
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileWithRetry, renameWithRetry } from "../files/atomic.js";
import type { $ZodIssue } from "zod/v4/core";

import { LeafPressError } from "../shared/errors.js";
import {
  ConfigSchema,
  DEFAULT_CONFIG,
  type LeafPressConfig,
} from "./schema.js";

function pathText(path: PropertyKey[]): string {
  return path.length === 0 ? "配置对象" : path.map(String).join(".");
}

function describeIssues(issues: readonly $ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = pathText([...issue.path]);
    if (issue.code === "unrecognized_keys") {
      const keys =
        "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
      const prefix = path === "配置对象" ? "" : `${path}.`;
      return `${path}：出现了不认识的字段（${keys
        .map(String)
        .map((key) => `${prefix}${key}`)
        .join("、")}），请检查是不是拼写错误`;
    }
    return `${path}：${issue.message}`;
  });
}

function formatIssues(issues: readonly $ZodIssue[]): string {
  const lines = describeIssues(issues);
  return lines.length === 1
    ? `配置文件有问题：${lines[0]}`
    : `配置文件有问题：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function invalidConfig(message: string, hint: string): LeafPressError {
  return new LeafPressError("CONFIG_INVALID", message, { hint });
}

function readJson(file: string): unknown {
  const raw = readFileWithRetry(file);
  try {
    return JSON.parse(raw.startsWith("\uFEFF") ? raw.slice(1) : raw) as unknown;
  } catch {
    throw invalidConfig(
      "config.json 不是合法的 JSON。",
      "用编辑器检查 config.json 的语法，或删掉后重新运行 leafpress init。",
    );
  }
}

function isCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function readJsonIfPresent(
  file: string,
): { exists: true; data: unknown } | { exists: false } {
  try {
    return { exists: true, data: readJson(file) };
  } catch (error) {
    if (isCode(error, "ENOENT")) return { exists: false };
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfig(value: unknown): LeafPressConfig {
  const parsed = ConfigSchema.safeParse(value);
  if (!parsed.success)
    throw invalidConfig(
      formatIssues(parsed.error.issues),
      "修正 config.json 里列出的字段后重试。",
    );
  return parsed.data;
}

function fromLegacy(value: Record<string, unknown>): LeafPressConfig {
  const legacyBrowser = isRecord(value.browser)
    ? value.browser["executablePath"]
    : undefined;
  const candidate = {
    version: 2,
    ...(legacyBrowser === undefined
      ? {}
      : { browser: { executablePath: legacyBrowser } }),
  };
  return parseConfig(candidate);
}

export function loadConfig(home: string): LeafPressConfig {
  const result = readJsonIfPresent(join(home, "config.json"));
  if (!result.exists) return DEFAULT_CONFIG;
  const data = result.data;
  if (isRecord(data) && data["version"] === 1) return fromLegacy(data);
  return parseConfig(data);
}

export function inspectConfig(home: string): {
  exists: boolean;
  version?: number;
} {
  const result = readJsonIfPresent(join(home, "config.json"));
  if (!result.exists) return { exists: false };
  const data = result.data;
  return isRecord(data) && typeof data["version"] === "number"
    ? { exists: true, version: data["version"] }
    : { exists: true };
}

function configContent(config: LeafPressConfig): string {
  return `${JSON.stringify(parseConfig(config), null, 2)}\n`;
}

function writeTemp(home: string, name: string, content: string): string {
  const target = join(home, name);
  const temp = join(home, `.${name}.tmp-${process.pid}-${randomUUID()}`);
  let fd: number | undefined;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeSync(fd, content, undefined, "utf8");
    closeSync(fd);
    fd = undefined;
  } catch {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Continue to remove the temporary file.
      }
    }
    try {
      rmSync(temp, { force: true });
    } catch {
      // Report the target path without exposing file contents.
    }
    throw new LeafPressError("STORE_FAILED", `配置文件写入失败：${target}`);
  }
  return temp;
}

export function writeConfig(home: string, config: LeafPressConfig): void {
  const content = configContent(config);
  try {
    mkdirSync(home, { recursive: true });
  } catch {
    throw new LeafPressError(
      "STORE_FAILED",
      `配置文件写入失败：${join(home, "config.json")}`,
    );
  }
  const target = join(home, "config.json");
  const temp = writeTemp(home, "config.json", content);
  try {
    renameWithRetry(temp, target);
  } catch (error) {
    try {
      rmSync(temp, { force: true });
    } catch {
      // Preserve the write error; the temporary file has already been isolated.
    }
    throw error;
  }
}

export function writeConfigIfAbsent(
  home: string,
  config: LeafPressConfig,
): { created: boolean; path: string } {
  const content = configContent(config);
  try {
    mkdirSync(home, { recursive: true });
  } catch {
    throw new LeafPressError(
      "STORE_FAILED",
      `配置文件写入失败：${join(home, "config.json")}`,
    );
  }
  const target = join(home, "config.json");
  const temp = writeTemp(home, "config.json", content);
  const create = (): { created: boolean; path: string } => {
    try {
      linkSync(temp, target);
      return { created: true, path: target };
    } catch (error) {
      if (isCode(error, "EEXIST")) return { created: false, path: target };
      if (
        !new Set(["ENOSYS", "EOPNOTSUPP", "ENOTSUP", "EXDEV"]).has(
          codeOf(error) ?? "",
        )
      )
        throw error;
      try {
        writeFileSync(target, content, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        return { created: true, path: target };
      } catch (fallbackError) {
        if (isCode(fallbackError, "EEXIST"))
          return { created: false, path: target };
        throw fallbackError;
      }
    }
  };

  let result: { created: boolean; path: string } | undefined;
  let operationFailed = false;
  let operationError: unknown;
  try {
    result = create();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }
  try {
    rmSync(temp, { force: true });
  } catch {
    throw new LeafPressError(
      "STORE_FAILED",
      `配置文件临时文件清理失败：${target}`,
    );
  }
  if (operationFailed) throw operationError;
  if (result === undefined)
    throw new LeafPressError("STORE_FAILED", `配置文件写入失败：${target}`);
  return result;
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function legacyBackupPath(home: string): string {
  const base = join(home, "config.v1.json.bak");
  if (!existsSync(base)) return base;
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let candidate = `${base}-${stamp}`;
  let suffix = 2;
  while (existsSync(candidate)) candidate = `${base}-${stamp}-${suffix++}`;
  return candidate;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function upgradeLegacyConfig(home: string): {
  upgraded: boolean;
  backupPath?: string;
} {
  const source = join(home, "config.json");
  const result = readJsonIfPresent(source);
  if (!result.exists) return { upgraded: false };
  const data = result.data;
  if (!isRecord(data) || data["version"] !== 1) return { upgraded: false };

  const config = fromLegacy(data);
  let backupPath = legacyBackupPath(home);
  while (true) {
    try {
      copyFileSync(source, backupPath, constants.COPYFILE_EXCL);
      break;
    } catch (error) {
      if (!isCode(error, "EEXIST"))
        throw new LeafPressError(
          "STORE_FAILED",
          `配置备份写入失败：${backupPath}`,
        );
      backupPath = `${legacyBackupPath(home)}-${randomUUID().slice(0, 8)}`;
    }
  }
  if (process.platform !== "win32") {
    try {
      chmodSync(backupPath, 0o600);
    } catch {
      throw new LeafPressError(
        "STORE_FAILED",
        `配置备份权限设置失败：${backupPath}`,
      );
    }
  }
  writeConfig(home, config);
  return { upgraded: true, backupPath };
}
