import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

import type { HomePaths } from "../config/home.js";
import { LeafPressError } from "../shared/errors.js";
import { writeConfig } from "../config/load.js";
import type { LeafPressConfig } from "../config/schema.js";

export interface BackupStore {
  backupTo(target: string): void;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function timestamp(now: Date): string {
  return `${now.getFullYear()}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
}

function createExportDir(paths: HomePaths, stamp: string): string {
  const base = join(paths.backupsDir, `export-${stamp}`);
  let suffix = 1;
  while (true) {
    const dir = suffix === 1 ? base : `${base}-${suffix}`;
    try {
      mkdirSync(dir);
      return dir;
    } catch (error) {
      if (errorCode(error) !== "EEXIST")
        throw new LeafPressError("STORE_FAILED", `备份目录创建失败：${dir}`);
      suffix += 1;
    }
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

export function exportBackup(
  paths: HomePaths,
  store: BackupStore,
  config: LeafPressConfig,
  now: Date,
): { dir: string } {
  try {
    mkdirSync(paths.backupsDir, { recursive: true });
  } catch {
    throw new LeafPressError(
      "STORE_FAILED",
      `备份目录创建失败：${paths.backupsDir}`,
    );
  }
  const dir = createExportDir(paths, timestamp(now));
  try {
    store.backupTo(join(dir, "leafpress.db"));

    const accountsOut = join(dir, "accounts");
    mkdirSync(accountsOut);
    if (existsSync(paths.accountsDir)) {
      for (const entry of readdirSync(paths.accountsDir, {
        withFileTypes: true,
      })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        copyFileSync(
          join(paths.accountsDir, entry.name),
          join(accountsOut, entry.name),
        );
      }
    }
    writeConfig(dir, config);
    return { dir };
  } catch {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Preserve the export failure without exposing database or config data.
    }
    throw new LeafPressError("STORE_FAILED", `备份导出失败：${dir}`);
  }
}
