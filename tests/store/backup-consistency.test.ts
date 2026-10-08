import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { MIGRATIONS } from "../../src/store/migrations.js";
import { openStore } from "../../src/store/open.js";

describe("升级备份一致性", () => {
  it("另一个连接持有读事务时，备份仍包含全部已提交数据", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-backup-consistency-"),
    );
    const dbFile = join(directory, "store.sqlite");
    let reader: DatabaseSync | undefined;
    let backup: DatabaseSync | undefined;
    let upgraded: ReturnType<typeof openStore> | undefined;
    try {
      const versionOne = openStore(dbFile, {
        migrations: MIGRATIONS.slice(0, 1),
      });
      versionOne.close();

      reader = new DatabaseSync(dbFile, { readOnly: true });
      reader.exec("BEGIN");
      expect(reader.prepare("SELECT id FROM works").all()).toEqual([]);
      const writer = new DatabaseSync(dbFile);
      try {
        const insert = writer.prepare(
          "INSERT INTO works (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        );
        insert.run("old-1", "已提交一", "t", "t");
        insert.run("old-2", "已提交二", "t", "t");
        insert.run("old-3", "已提交三", "t", "t");
      } finally {
        writer.close();
      }
      expect(
        reader.prepare("SELECT COUNT(*) AS count FROM works").get(),
      ).toEqual({ count: 0 });

      upgraded = openStore(dbFile);
      const backupPath = upgraded.migration.backupPath;
      expect(backupPath).toMatch(
        /[/\\]backups[/\\]store\.sqlite\.bak-v1-\d{17}-\d+$/,
      );
      expect(dirname(dirname(backupPath ?? ""))).toBe(directory);
      backup = new DatabaseSync(backupPath ?? "", { readOnly: true });
      expect(backup.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 1,
      });
      expect(
        backup.prepare("SELECT id, title FROM works ORDER BY id").all(),
      ).toEqual([
        { id: "old-1", title: "已提交一" },
        { id: "old-2", title: "已提交二" },
        { id: "old-3", title: "已提交三" },
      ]);
      expect(
        reader.prepare("SELECT COUNT(*) AS count FROM works").get(),
      ).toEqual({ count: 0 });
    } finally {
      backup?.close();
      upgraded?.close();
      if (reader?.isTransaction) reader.exec("ROLLBACK");
      if (reader?.isOpen) reader.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
