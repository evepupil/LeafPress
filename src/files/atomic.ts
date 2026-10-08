import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { LeafPressError } from "../shared/errors.js";

const RETRYABLE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RETRY_DEADLINE_MS = 2_000;
const WAIT_CELL = new Int32Array(new SharedArrayBuffer(4));

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function storeFailure(file: string): LeafPressError {
  return new LeafPressError("STORE_FAILED", `文件写入失败：${file}`);
}

function retryFileOperation<T>(file: string, operation: () => T): T {
  const deadline = Date.now() + RETRY_DEADLINE_MS;
  let delayMs = 20;

  while (true) {
    try {
      return operation();
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT") throw error;
      if (!RETRYABLE_CODES.has(code ?? "")) throw storeFailure(file);
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw storeFailure(file);
      const jitterMs = Math.floor(Math.random() * 20);
      Atomics.wait(WAIT_CELL, 0, 0, Math.min(delayMs + jitterMs, remainingMs));
      delayMs = Math.min(delayMs + 10, 60);
    }
  }
}

export function readFileWithRetry(file: string): string {
  return retryFileOperation(file, () => readFileSync(file, "utf8"));
}

export function renameWithRetry(
  source: string,
  target: string,
  missingOk = false,
): boolean {
  try {
    retryFileOperation(target, () => renameSync(source, target));
    return true;
  } catch (error) {
    if (missingOk && errorCode(error) === "ENOENT") return false;
    if (errorCode(error) === "ENOENT") throw storeFailure(target);
    throw error;
  }
}

function removeTemp(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {
    throw storeFailure(file);
  }
}

export function writeFileAtomic(file: string, content: string): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
  } catch {
    throw storeFailure(file);
  }

  try {
    if (readFileWithRetry(file) === content) return;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }

  const temp = join(dirname(file), `.${randomUUID()}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeSync(fd, content, undefined, "utf8");
    closeSync(fd);
    fd = undefined;
    renameWithRetry(temp, file);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the write failure and still attempt to remove the temporary file.
      }
    }
    removeTemp(temp);
    if (error instanceof LeafPressError) throw error;
    throw storeFailure(file);
  }
}
