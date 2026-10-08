import type { MetaRepo } from "./types.js";
import {
  readRepo,
  requiredNumber,
  requiredString,
  writeRepo,
  type RepoContext,
} from "./repo-common.js";
import { storeFailed } from "./sql.js";

export function createMetaRepo(context: RepoContext): MetaRepo {
  return {
    version() {
      return readRepo("meta", "key, value", () => {
        const rows = context.db
          .prepare(
            "SELECT key, value FROM meta WHERE key IN ('seq', 'snapshot_seq')",
          )
          .all();
        const values = new Map<string, number>();
        for (const row of rows) {
          values.set(
            requiredString(row, "key", "meta"),
            requiredNumber(row, "value", "meta"),
          );
        }
        const seq = values.get("seq");
        const snapshotSeq = values.get("snapshot_seq");
        if (seq === undefined || snapshotSeq === undefined) {
          throw storeFailed("记录库表「meta」列「key」缺少变更序号。");
        }
        return { seq, snapshotSeq };
      });
    },
    nextSerial(name) {
      const key = `serial_${name}`;
      return writeRepo(context, "meta", "key, value", () => {
        const row = context.db
          .prepare("SELECT value FROM meta WHERE key = ?")
          .get(key);
        if (row === undefined)
          throw storeFailed("记录库表「meta」列「key」缺少编号序号。");
        const value = requiredNumber(row, "value", "meta") + 1;
        const updated = context.db
          .prepare("UPDATE meta SET value = ? WHERE key = ?")
          .run(value, key);
        if (updated.changes !== 1)
          throw storeFailed("记录库表「meta」列「value」更新失败。");
        return value;
      });
    },
  };
}
