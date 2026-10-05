import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { MIGRATIONS } from "../../src/store/migrations.js";
import { openStore } from "../../src/store/open.js";
import type { Migration } from "../../src/store/types.js";

describe("升级备份一致性", () => {
  it("第二个连接持有读事务时，VACUUM INTO 备份仍包含全部已提交数据", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-backup-snapshot-"),
    );
    const dbFile = join(directory, "store.sqlite");
    let initial: ReturnType<typeof openStore> | undefined;
    let upgraded: ReturnType<typeof openStore> | undefined;
    let reader: DatabaseSync | undefined;
    let backup: DatabaseSync | undefined;
    try {
      initial = openStore(dbFile);

      reader = new DatabaseSync(dbFile, { readOnly: true });
      reader.exec("BEGIN");
      expect(reader.prepare("SELECT title FROM works").all()).toEqual([]);

      initial.works.create({ title: "读事务之后提交一" });
      initial.works.create({ title: "读事务之后提交二" });
      initial.works.create({ title: "读事务之后提交三" });
      expect(
        reader.prepare("SELECT count(*) AS total FROM works").get(),
      ).toEqual({ total: 0 });

      const migrationTwo: Migration = {
        version: 2,
        name: "快照测试升级",
        sql: "CREATE TABLE snapshot_marker (value TEXT NOT NULL);",
      };
      upgraded = openStore(dbFile, {
        migrations: [...MIGRATIONS, migrationTwo],
        now: () => new Date("2026-10-05T01:02:03.000Z"),
      });
      expect(upgraded.migration).toMatchObject({ from: 1, to: 2 });
      const backupPath = upgraded.migration.backupPath;
      expect(backupPath).toBe(
        `${dbFile}.bak-v1-20261005010203000-${process.pid}`,
      );

      backup = new DatabaseSync(backupPath!, { readOnly: true });
      expect(backup.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 1,
      });
      expect(
        backup.prepare("SELECT title FROM works ORDER BY title").all(),
      ).toEqual([
        { title: "读事务之后提交一" },
        { title: "读事务之后提交三" },
        { title: "读事务之后提交二" },
      ]);
      expect(
        backup
          .prepare("SELECT name FROM sqlite_master WHERE name = ?")
          .get("snapshot_marker"),
      ).toBeUndefined();
      expect(
        reader.prepare("SELECT count(*) AS total FROM works").get(),
      ).toEqual({ total: 0 });
    } finally {
      backup?.close();
      upgraded?.close();
      if (reader?.isTransaction) reader.exec("ROLLBACK");
      if (reader?.isOpen) reader.close();
      initial?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
