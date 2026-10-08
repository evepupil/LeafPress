import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { HomePaths } from "../config/home.js";
import { LeafPressError } from "../shared/errors.js";
import { readFileWithRetry, renameWithRetry } from "./atomic.js";
import { taskFolderPath } from "./task-folder.js";

const RETRY_MS = 50;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_STALE_MS = 30_000;
const WAIT_CELL = new Int32Array(new SharedArrayBuffer(4));
const OWNER_FILE = "owner";

export interface DirectoryLockOptions {
  timeoutMs?: number;
  staleMs?: number;
  timeoutMessage?: string;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function storeFailure(path: string): LeafPressError {
  return new LeafPressError("STORE_FAILED", `目录锁操作失败：${path}`);
}

function removeDirectory(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    throw storeFailure(path);
  }
}

function readOwner(lockDir: string): string | undefined {
  try {
    return readFileWithRetry(join(lockDir, OWNER_FILE));
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

function createOwnedDirectory(path: string): string {
  const token = randomUUID();
  let created = false;
  try {
    mkdirSync(path);
    created = true;
    writeFileSync(join(path, OWNER_FILE), token, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return token;
  } catch (error) {
    if (created) {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        throw storeFailure(path);
      }
    }
    if (errorCode(error) === "EEXIST") throw error;
    throw storeFailure(path);
  }
}

function acquireReaper(
  path: string,
  deadline: number,
  timeoutMessage: string,
): string {
  while (true) {
    try {
      return createOwnedDirectory(path);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      if (Date.now() >= deadline)
        throw new LeafPressError("STORE_FAILED", timeoutMessage);
      Atomics.wait(WAIT_CELL, 0, 0, RETRY_MS);
    }
  }
}

function isExpired(lockDir: string, staleMs: number): boolean {
  try {
    return Date.now() - statSync(lockDir).mtimeMs > staleMs;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw storeFailure(lockDir);
  }
}

function reclaimExpired(
  lockDir: string,
  staleMs: number,
  deadline: number,
  timeoutMessage: string,
): boolean {
  const reaperDir = `${lockDir}.reaper`;
  const token = acquireReaper(reaperDir, deadline, timeoutMessage);
  try {
    if (!isExpired(lockDir, staleMs)) return false;
    const tombstone = `${lockDir}.stale-${randomUUID()}`;
    if (!renameWithRetry(lockDir, tombstone, true)) return false;
    removeDirectory(tombstone);
    return true;
  } finally {
    if (readOwner(reaperDir) === token) removeDirectory(reaperDir);
  }
}

function releaseOwnedDirectory(
  lockDir: string,
  token: string,
  deadline: number,
  timeoutMessage: string,
): void {
  const reaperDir = `${lockDir}.reaper`;
  const reaperToken = acquireReaper(reaperDir, deadline, timeoutMessage);
  try {
    if (readOwner(lockDir) !== token) return;
    const releasedDir = `${lockDir}.released-${randomUUID()}`;
    if (renameWithRetry(lockDir, releasedDir, true))
      removeDirectory(releasedDir);
  } finally {
    if (readOwner(reaperDir) === reaperToken) removeDirectory(reaperDir);
  }
}

function acquireLock(
  lockDir: string,
  deadline: number,
  staleMs: number,
  timeoutMessage: string,
): string {
  while (true) {
    try {
      return createOwnedDirectory(lockDir);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      if (isExpired(lockDir, staleMs)) {
        reclaimExpired(lockDir, staleMs, deadline, timeoutMessage);
        continue;
      }
      if (Date.now() >= deadline)
        throw new LeafPressError("STORE_FAILED", timeoutMessage);
      Atomics.wait(WAIT_CELL, 0, 0, RETRY_MS);
    }
  }
}

export function withDirectoryLock<T>(
  lockDir: string,
  fn: () => T,
  options: DirectoryLockOptions = {},
): T {
  try {
    mkdirSync(dirname(lockDir), { recursive: true });
  } catch {
    throw storeFailure(lockDir);
  }
  const timeoutMessage = options.timeoutMessage ?? "目录正被别的进程占用。";
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const token = acquireLock(
    lockDir,
    deadline,
    options.staleMs ?? DEFAULT_STALE_MS,
    timeoutMessage,
  );

  try {
    return fn();
  } finally {
    releaseOwnedDirectory(lockDir, token, deadline, timeoutMessage);
  }
}

export function withTaskLock<T>(
  paths: HomePaths,
  workId: string,
  fn: () => T,
): T {
  const folder = taskFolderPath(paths, workId);
  try {
    mkdirSync(folder, { recursive: true });
  } catch {
    throw storeFailure(folder);
  }
  return withDirectoryLock(join(folder, ".lock"), fn, {
    timeoutMessage: "任务文件夹正被别的进程占用。",
  });
}
