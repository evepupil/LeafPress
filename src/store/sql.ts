import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import { LeafPressError } from "../shared/errors.js";

export type SqlRow = Record<string, SQLOutputValue>;

export interface TransactionFunctions {
  transaction<T>(fn: () => T): T;
  withTransaction<T>(fn: () => T): T;
  withReadTransaction<T>(fn: () => T): T;
}

export interface StoreContext extends TransactionFunctions {
  readonly db: DatabaseSync;
  readonly now: () => Date;
  readonly newId: () => string;
}

export function storeFailed(message: string, cause?: unknown): LeafPressError {
  return new LeafPressError("STORE_FAILED", message, { cause });
}

export function storeOperation<T>(message: string, fn: () => T): T {
  try {
    return fn();
  } catch (cause) {
    if (cause instanceof LeafPressError) throw cause;
    throw storeFailed(message, cause);
  }
}

export function requiredString(
  row: SqlRow,
  column: string,
  table: string,
): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw storeFailed(`记录库表「${table}」的「${column}」不是有效文本。`);
  }
  return value;
}

export function requiredNumber(
  row: SqlRow,
  column: string,
  table: string,
): number {
  const value = row[column];
  if (typeof value !== "number") {
    throw storeFailed(`记录库表「${table}」的「${column}」不是有效数字。`);
  }
  return value;
}

export function optionalString(
  row: SqlRow,
  column: string,
  table: string,
): string | undefined {
  const value = row[column];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") {
    throw storeFailed(`记录库表「${table}」的「${column}」不是有效文本。`);
  }
  return value;
}

export function optionalNumber(
  row: SqlRow,
  column: string,
  table: string,
): number | undefined {
  const value = row[column];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "number") {
    throw storeFailed(`记录库表「${table}」的「${column}」不是有效数字。`);
  }
  return value;
}

export function encodeJson(
  value: unknown,
  table: string,
  column: string,
): string {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError("JSON.stringify 返回空值");
    return encoded;
  } catch (cause) {
    throw storeFailed(
      `无法写入记录库表「${table}」的 JSON 列「${column}」。`,
      cause,
    );
  }
}

export function validateFiniteNumber(
  value: number,
  table: string,
  column: string,
): void {
  if (!Number.isFinite(value)) {
    throw storeFailed(`记录库表「${table}」列「${column}」必须是有限数字。`);
  }
}

export function validateFiniteNumbers(
  values: Readonly<Record<string, number>>,
  table: string,
  column: string,
): void {
  if (Object.values(values).some((value) => !Number.isFinite(value))) {
    throw storeFailed(
      `记录库表「${table}」JSON 列「${column}」必须只含有限数字。`,
    );
  }
}

export function decodeJson<T>(
  value: SQLOutputValue | undefined,
  table: string,
  column: string,
): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") {
    throw storeFailed(`记录库表「${table}」的 JSON 列「${column}」不是文本。`);
  }
  try {
    return JSON.parse(value) as T;
  } catch (cause) {
    throw storeFailed(
      `记录库表「${table}」的 JSON 列「${column}」解析失败。`,
      cause,
    );
  }
}

export function createTransactionFunctions(
  db: DatabaseSync,
): TransactionFunctions {
  function runTransaction<T>(fn: () => T): T {
    if (db.isTransaction) {
      throw storeFailed("记录库事务不支持嵌套调用。");
    }
    assertSynchronousCallback(fn);

    try {
      db.exec("BEGIN IMMEDIATE");
    } catch (cause) {
      throw storeFailed("无法开始记录库事务。", cause);
    }
    try {
      const result = ensureSynchronousResult(fn());
      db.exec("COMMIT");
      return result;
    } catch (error) {
      if (db.isTransaction) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // 保留原始异常，回滚失败不能覆盖导致事务失败的原因。
        }
      }
      throw error;
    }
  }

  function runNestedTransaction<T>(fn: () => T): T {
    assertSynchronousCallback(fn);
    return ensureSynchronousResult(fn());
  }

  function runReadTransaction<T>(fn: () => T): T {
    assertSynchronousCallback(fn);
    if (db.isTransaction) return fn();
    try {
      db.exec("BEGIN");
    } catch (cause) {
      throw storeFailed("无法开始记录库只读事务。", cause);
    }
    try {
      const result = ensureSynchronousResult(fn());
      db.exec("COMMIT");
      return result;
    } catch (error) {
      if (db.isTransaction) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // 保留原始异常，回滚失败不能覆盖导致事务失败的原因。
        }
      }
      throw error;
    }
  }

  function assertSynchronousCallback(fn: () => unknown): void {
    if (Object.prototype.toString.call(fn) === "[object AsyncFunction]") {
      throw storeFailed("事务回调不能是异步函数。");
    }
  }

  function ensureSynchronousResult<T>(result: T): T {
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(() => undefined);
      throw storeFailed("事务回调不能是异步函数。");
    }
    return result;
  }

  return {
    transaction: runTransaction,
    withTransaction<T>(fn: () => T): T {
      return db.isTransaction ? runNestedTransaction(fn) : runTransaction(fn);
    },
    withReadTransaction<T>(fn: () => T): T {
      return runReadTransaction(fn);
    },
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
