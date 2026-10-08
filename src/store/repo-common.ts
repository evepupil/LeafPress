import type { TransactionFunctions } from "./sql.js";
import {
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
  storeFailed,
  storeOperation,
  type SqlRow,
  type StoreContext,
} from "./sql.js";

export type RepoContext = StoreContext & TransactionFunctions;

export function readRepo<T>(table: string, columns: string, fn: () => T): T {
  return storeOperation(`读取记录库表「${table}」列「${columns}」失败。`, fn);
}

export function writeRepo<T>(
  context: RepoContext,
  table: string,
  columns: string,
  fn: () => T,
  snapshot = false,
): T {
  return storeOperation(`写入记录库表「${table}」列「${columns}」失败。`, () =>
    context.withTransaction(() => {
      const result = fn();
      incrementMeta(context, "seq");
      if (snapshot) incrementMeta(context, "snapshot_seq");
      return result;
    }),
  );
}

export function incrementMeta(
  context: RepoContext,
  key: "seq" | "snapshot_seq",
): void {
  const result = context.db
    .prepare("UPDATE meta SET value = value + 1 WHERE key = ?")
    .run(key);
  if (result.changes !== 1) {
    throw storeFailed(`记录库表「meta」列「${key}」更新失败。`);
  }
}

export function ensureUpdated(
  result: { changes: number | bigint },
  table: string,
  column: string,
): void {
  if (result.changes !== 1 && result.changes !== 1n) {
    throw storeFailed(`记录库表「${table}」列「${column}」对应的记录不存在。`);
  }
}

export {
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
  type SqlRow,
};
