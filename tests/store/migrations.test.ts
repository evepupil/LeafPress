import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { MIGRATIONS, migrate } from "../../src/store/migrations.js";
import type { Migration } from "../../src/store/types.js";

async function withDatabase<T>(
  fn: (db: DatabaseSync, dbFile: string) => T | Promise<T>,
  filename = "store.sqlite",
): Promise<T> {
  const directory = await mkdtemp(
    join(tmpdir(), "leafpress-store-migrations-"),
  );
  const dbFile = join(directory, filename);
  const db = new DatabaseSync(dbFile);
  try {
    return await fn(db, dbFile);
  } finally {
    if (db.isOpen) db.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const migrationTwo: Migration = {
  version: 2,
  name: "增加升级标记",
  sql: "CREATE TABLE upgrade_marker (value TEXT NOT NULL);",
};

describe("记录库升级", () => {
  it("新库建立全部基础表并记录版本 1，重复升级不产生备份", async () => {
    await withDatabase((db, dbFile) => {
      const first = migrate(db, dbFile, MIGRATIONS, {
        databaseExistedBeforeOpen: false,
      });
      expect(first).toEqual({ from: 0, to: 1 });
      expect(db.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 1,
      });
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((row) => row.name);
      expect(tables).toEqual([
        "assets",
        "publications",
        "run_steps",
        "runs",
        "sources",
        "variants",
        "works",
      ]);
      const publicationColumns = db
        .prepare("PRAGMA table_info(publications)")
        .all()
        .map((row) => row.name);
      expect(publicationColumns).toContain("note");
      expect(publicationColumns.indexOf("note")).toBe(
        publicationColumns.indexOf("published_at") + 1,
      );
      expect(publicationColumns.indexOf("raw")).toBe(
        publicationColumns.indexOf("note") + 1,
      );

      expect(migrate(db, dbFile, MIGRATIONS)).toEqual({ from: 1, to: 1 });
    });
  });

  it("成功升级前用转义后的 VACUUM INTO 路径保存原库", async () => {
    await withDatabase((db, dbFile) => {
      migrate(db, dbFile, MIGRATIONS, { databaseExistedBeforeOpen: false });
      db.prepare(
        "INSERT INTO works (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      ).run("w1", "升级前作品", "t", "t");

      const report = migrate(db, dbFile, [...MIGRATIONS, migrationTwo], {
        databaseExistedBeforeOpen: true,
        now: () => new Date("2026-01-02T03:04:05.000Z"),
      });
      expect(report).toEqual({
        from: 1,
        to: 2,
        backupPath: `${dbFile}.bak-v1-20260102030405000-${process.pid}`,
      });
      expect(db.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 2,
      });

      const backup = new DatabaseSync(report.backupPath!, { readOnly: true });
      try {
        expect(backup.prepare("PRAGMA user_version").get()).toEqual({
          user_version: 1,
        });
        expect(
          backup.prepare("SELECT title FROM works WHERE id = ?").get("w1"),
        ).toEqual({
          title: "升级前作品",
        });
        expect(
          backup
            .prepare("SELECT name FROM sqlite_master WHERE name = ?")
            .get("upgrade_marker"),
        ).toBeUndefined();
      } finally {
        backup.close();
      }
    }, "store's.sqlite");
  });

  it("升级脚本失败时回滚本版改动并保留备份", async () => {
    await withDatabase((db, dbFile) => {
      migrate(db, dbFile, MIGRATIONS, { databaseExistedBeforeOpen: false });
      db.prepare(
        "INSERT INTO works (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      ).run("w1", "仍然存在", "t", "t");
      const broken: Migration = {
        ...migrationTwo,
        sql: "CREATE TABLE rolled_back (value TEXT); INSERT INTO missing_table VALUES ('x');",
      };

      let caught: unknown;
      try {
        migrate(db, dbFile, [...MIGRATIONS, broken], {
          databaseExistedBeforeOpen: true,
          now: () => new Date("2026-01-02T03:04:05.000Z"),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "MIGRATION_FAILED" });
      expect((caught as Error).message).toContain("升级到第 2 版");
      expect(db.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 1,
      });
      expect(
        db.prepare("SELECT title FROM works WHERE id = ?").get("w1"),
      ).toEqual({
        title: "仍然存在",
      });
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE name = ?")
          .get("rolled_back"),
      ).toBeUndefined();
      expect((caught as { hint?: string }).hint).toContain(
        `${dbFile}.bak-v1-20260102030405000-${process.pid}`,
      );
    });
  });

  it("拒绝版本不连续的脚本和高于代码版本的数据库", async () => {
    await withDatabase((db, dbFile) => {
      expect(() =>
        migrate(db, dbFile, [{ version: 2, name: "跳号", sql: "SELECT 1" }]),
      ).toThrow("记录库升级脚本版本必须从 1 开始连续递增。");

      db.exec("PRAGMA user_version = 2");
      expect(() => migrate(db, dbFile, MIGRATIONS)).toThrow(
        "记录库版本为 2，高于当前代码支持的版本 1。",
      );
    });
  });
});
