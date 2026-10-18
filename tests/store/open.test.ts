import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { inspectStore } from "../../src/store/inspect.js";
import { MIGRATIONS } from "../../src/store/migrations.js";
import { openStore } from "../../src/store/open.js";
import { account, withStore, work } from "./helpers.js";

describe("openStore", () => {
  it("打开启用 WAL 和外键，重复打开不再迁移", async () => {
    await withStore((store, dbFile) => {
      expect(store.migration).toEqual({ from: 0, to: 3 });
      store.accounts.insert(account());
      expect(inspectStore(dbFile, MIGRATIONS.length)).toEqual({
        exists: true,
        version: 3,
        expectedVersion: 3,
      });
      store.close();

      const reopened = openStore(dbFile);
      try {
        expect(reopened.migration).toEqual({ from: 3, to: 3 });
        const db = new DatabaseSync(dbFile, { readOnly: true });
        try {
          expect(db.prepare("PRAGMA journal_mode").get()).toEqual({
            journal_mode: "wal",
          });
        } finally {
          db.close();
        }
        expect(() =>
          reopened.works.insert(
            work("orphan", { accountId: "missing-account" }),
          ),
        ).toThrow(expect.objectContaining({ code: "STORE_FAILED" }));
        expect(reopened.meta.version()).toEqual({ seq: 1, snapshotSeq: 0 });
      } finally {
        reopened.close();
      }
    });
  });

  it("backupTo 导出可打开且数据一致，并正确转义目标路径", async () => {
    await withStore((store, _dbFile, directory) => {
      store.accounts.insert(account());
      store.settings.set(
        "blog-1",
        "timezone",
        "Asia/Shanghai",
        "2026-02-03T04:05:06+08:00",
      );
      const target = `${directory}/exports/backup's.sqlite`;
      store.backupTo(target);
      const backup = new DatabaseSync(target, { readOnly: true });
      try {
        expect(backup.prepare("SELECT id, name FROM accounts").all()).toEqual([
          { id: "blog-1", name: "中文账号" },
        ]);
        expect(
          backup.prepare("SELECT key, value FROM account_settings").all(),
        ).toEqual([{ key: "timezone", value: "Asia/Shanghai" }]);
        expect(backup.prepare("PRAGMA user_version").get()).toEqual({
          user_version: 3,
        });
      } finally {
        backup.close();
      }
    });
  });
});
