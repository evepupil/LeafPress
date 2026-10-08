import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";
import { MIGRATIONS } from "../../src/store/migrations.js";
import type { Migration } from "../../src/store/types.js";

async function withDirectory<T>(
  run: (directory: string) => T | Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(
    join(tmpdir(), "leafpress-migration-atomic-"),
  );
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("记录库迁移原子性", () => {
  it("测试注入的连续升级脚本可执行", async () => {
    await withDirectory((directory) => {
      const dbFile = join(directory, "store.sqlite");
      const marker: Migration = {
        version: 2,
        name: "测试升级",
        sql: "CREATE TABLE injected_marker (value TEXT NOT NULL);",
      };
      const store = openStore(dbFile, {
        migrations: [...MIGRATIONS.slice(0, 1), marker],
      });
      try {
        expect(store.migration).toEqual({ from: 0, to: 2 });
      } finally {
        store.close();
      }
      const db = new DatabaseSync(dbFile, { readOnly: true });
      try {
        expect(db.prepare("PRAGMA user_version").get()).toEqual({
          user_version: 2,
        });
        expect(
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE name = 'injected_marker'",
            )
            .get(),
        ).toEqual({ name: "injected_marker" });
      } finally {
        db.close();
      }
    });
  });

  it("多个待执行版本共享同一事务，后续失败会回滚此前版本", async () => {
    await withDirectory((directory) => {
      const dbFile = join(directory, "store.sqlite");
      const broken: Migration = {
        version: 2,
        name: "损坏迁移",
        sql: "CREATE TABLE rolled_back (value TEXT); INSERT INTO missing_table VALUES ('x');",
      };
      expect(() =>
        openStore(dbFile, { migrations: [...MIGRATIONS.slice(0, 1), broken] }),
      ).toThrow(expect.objectContaining({ code: "MIGRATION_FAILED" }));
      const db = new DatabaseSync(dbFile, { readOnly: true });
      try {
        expect(db.prepare("PRAGMA user_version").get()).toEqual({
          user_version: 0,
        });
        for (const table of ["works", "sources", "rolled_back"]) {
          expect(
            db
              .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
              )
              .get(table),
          ).toBeUndefined();
        }
      } finally {
        db.close();
      }
    });
  });

  it("迁移脚本失败会回滚该版 SQL 和 user_version", async () => {
    await withDirectory((directory) => {
      const dbFile = join(directory, "store.sqlite");
      const first = openStore(dbFile, { migrations: MIGRATIONS.slice(0, 1) });
      first.close();
      const broken: Migration = {
        version: 2,
        name: "损坏迁移",
        sql: "CREATE TABLE rolled_back (value TEXT); INSERT INTO missing_table VALUES ('x');",
      };
      expect(() =>
        openStore(dbFile, { migrations: [...MIGRATIONS.slice(0, 1), broken] }),
      ).toThrow(expect.objectContaining({ code: "MIGRATION_FAILED" }));
      const db = new DatabaseSync(dbFile, { readOnly: true });
      try {
        expect(db.prepare("PRAGMA user_version").get()).toEqual({
          user_version: 1,
        });
        expect(
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE name = 'rolled_back'",
            )
            .get(),
        ).toBeUndefined();
        expect(
          db
            .prepare("SELECT name FROM sqlite_master WHERE name = 'works'")
            .get(),
        ).toEqual({ name: "works" });
      } finally {
        db.close();
      }
    });
  });

  it("拒绝不连续迁移版本和高于代码支持版本的库", async () => {
    await withDirectory((directory) => {
      const dbFile = join(directory, "store.sqlite");
      const skipped: Migration = { version: 2, name: "跳号", sql: "SELECT 1;" };
      expect(() => openStore(dbFile, { migrations: [skipped] })).toThrow(
        expect.objectContaining({
          code: "MIGRATION_FAILED",
          message: "记录库升级脚本版本必须从 1 开始连续递增。",
        }),
      );
      const current = openStore(dbFile);
      current.close();
      expect(() =>
        openStore(dbFile, { migrations: MIGRATIONS.slice(0, 1) }),
      ).toThrow(
        expect.objectContaining({
          code: "MIGRATION_FAILED",
          message: "记录库版本为 2，高于当前代码支持的版本 1。",
        }),
      );
    });
  });
});
