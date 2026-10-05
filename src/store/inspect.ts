import { closeSync, openSync, readSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { LeafPressError } from "../shared/errors.js";
import type { StoreInspection } from "./types.js";
import { expectedStoreVersion, MIGRATIONS } from "./migrations.js";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");
const SQLITE_HEADER_BYTES = 100;
const USER_VERSION_OFFSET = 60;

export function inspectStore(dbFile: string): StoreInspection {
  const expectedVersion = expectedStoreVersion(MIGRATIONS);
  try {
    const fileSize = getFileSize(dbFile);
    if (fileSize === undefined) return { exists: false, expectedVersion };
    if (fileSize === 0) return { exists: true, version: 0, expectedVersion };
    const version = hasNonEmptyWal(dbFile)
      ? readUserVersion(dbFile)
      : readHeaderVersion(dbFile);
    return { exists: true, version, expectedVersion };
  } catch (cause) {
    throw new LeafPressError("STORE_FAILED", "只读检查记录库失败。", {
      hint: "请确认文件是有效的 SQLite 记录库。",
      cause,
    });
  }
}

function getFileSize(dbFile: string): number | undefined {
  try {
    return statSync(dbFile).size;
  } catch (cause) {
    if (isNotFound(cause)) return undefined;
    throw cause;
  }
}

function hasNonEmptyWal(dbFile: string): boolean {
  try {
    return statSync(`${dbFile}-wal`).size > 0;
  } catch (cause) {
    if (isNotFound(cause)) return false;
    throw cause;
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}

function readUserVersion(dbFile: string): number {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    if (typeof version !== "number" || !Number.isSafeInteger(version)) {
      throw new TypeError("PRAGMA user_version 未返回有效整数");
    }
    return version;
  } finally {
    db.close();
  }
}

function readHeaderVersion(dbFile: string): number {
  const fileDescriptor = openSync(dbFile, "r");
  try {
    const header = Buffer.alloc(SQLITE_HEADER_BYTES);
    let bytesRead = 0;
    while (bytesRead < header.length) {
      const count = readSync(
        fileDescriptor,
        header,
        bytesRead,
        header.length - bytesRead,
        bytesRead,
      );
      if (count === 0) break;
      bytesRead += count;
    }
    if (
      bytesRead !== SQLITE_HEADER_BYTES ||
      !header.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)
    ) {
      throw new TypeError("文件头不是有效的 SQLite 数据库头");
    }
    return header.readUInt32BE(USER_VERSION_OFFSET);
  } finally {
    closeSync(fileDescriptor);
  }
}
