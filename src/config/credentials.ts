import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { LeafPressError } from "../shared/errors.js";
import { readFileWithRetry, renameWithRetry } from "../files/atomic.js";
import { withDirectoryLock } from "../files/lock.js";

interface CredentialData {
  version: 1;
  accounts: Record<string, Record<string, string>>;
}

export interface CredentialStore {
  keys(accountId: string): Set<string>;
  get(accountId: string, key: string): string | undefined;
  set(accountId: string, key: string, value: string): void;
  remove(accountId: string, key: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCredentialData(value: unknown): value is CredentialData {
  if (
    !isRecord(value) ||
    value["version"] !== 1 ||
    !isRecord(value["accounts"])
  )
    return false;
  if (Object.keys(value).length !== 2) return false;
  return Object.values(value["accounts"]).every(
    (account) =>
      isRecord(account) &&
      Object.values(account).every((secret) => typeof secret === "string"),
  );
}

function emptyMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function emptyData(): CredentialData {
  return { version: 1, accounts: emptyMap<Record<string, string>>() };
}

function normalizedData(value: CredentialData): CredentialData {
  const accounts = emptyMap<Record<string, string>>();
  for (const [accountId, values] of Object.entries(value.accounts)) {
    const account = emptyMap<string>();
    for (const [key, secret] of Object.entries(values)) account[key] = secret;
    accounts[accountId] = account;
  }
  return { version: 1, accounts };
}

function readData(file: string): CredentialData {
  let raw: string;
  try {
    raw = readFileWithRetry(file);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return emptyData();
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw invalidStore(file);
  }
  if (!isCredentialData(value)) throw invalidStore(file);
  return normalizedData(value);
}

function invalidStore(file: string): LeafPressError {
  return new LeafPressError("CONFIG_INVALID", `凭证文件格式不对：${file}`, {
    hint: "检查这个文件，或者删掉后重新填密钥。",
  });
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function writeData(file: string, data: CredentialData): void {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    mkdirSync(dirname(file), { recursive: true });
    fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    closeSync(fd);
    fd = undefined;
    renameWithRetry(temp, file);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Keep the original failure while cleaning up the temporary file.
      }
    }
    try {
      rmSync(temp, { force: true });
    } catch {
      // The sanitized write error below is the useful failure for callers.
    }
    if (error instanceof LeafPressError) throw error;
    throw new LeafPressError("STORE_FAILED", `凭证文件写入失败：${file}`);
  }
}

export function openCredentials(file: string): CredentialStore {
  const lockDir = `${file}.lock`;

  return {
    keys(accountId: string): Set<string> {
      return new Set(Object.keys(readData(file).accounts[accountId] ?? {}));
    },
    get(accountId: string, key: string): string | undefined {
      return readData(file).accounts[accountId]?.[key];
    },
    set(accountId: string, key: string, value: string): void {
      const normalized = value.trim();
      if (normalized.length === 0) {
        throw new LeafPressError(
          "CONFIG_INVALID",
          "密钥不能为空，请使用 remove 删除。",
          {
            hint: "提供非空密钥；删除密钥请使用 remove。",
          },
        );
      }
      withDirectoryLock(
        lockDir,
        () => {
          const data = readData(file);
          (data.accounts[accountId] ??= emptyMap<string>())[key] = normalized;
          writeData(file, data);
        },
        { timeoutMessage: "凭证文件正被别的进程占用。" },
      );
    },
    remove(accountId: string, key: string): void {
      withDirectoryLock(
        lockDir,
        () => {
          const data = readData(file);
          const account = data.accounts[accountId];
          if (account !== undefined) {
            delete account[key];
            if (Object.keys(account).length === 0)
              delete data.accounts[accountId];
          }
          writeData(file, data);
        },
        { timeoutMessage: "凭证文件正被别的进程占用。" },
      );
    },
  };
}
