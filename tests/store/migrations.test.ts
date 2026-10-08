import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";
import { MIGRATIONS } from "../../src/store/migrations.js";

async function withDirectory<T>(
  run: (directory: string) => T | Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(
    join(tmpdir(), "leafpress-store-migrations-"),
  );
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("记录库升级", () => {
  it("新库升级到第 2 版，表、meta 初值和报告正确", async () => {
    await withDirectory((directory) => {
      const dbFile = join(directory, "nested", "store.sqlite");
      const store = openStore(dbFile);
      try {
        expect(store.migration).toEqual({ from: 0, to: 2 });
        const db = new DatabaseSync(dbFile, { readOnly: true });
        try {
          const tables = db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
            )
            .all()
            .map((row) => row.name);
          expect(tables).toEqual([
            "account_days",
            "account_settings",
            "accounts",
            "ideas",
            "meta",
            "pulls",
            "sqlite_sequence",
            "weekly_notes",
            "work_feedback",
            "work_logs",
            "work_snapshots",
            "works",
          ]);
          expect(
            db.prepare("SELECT key, value FROM meta ORDER BY key").all(),
          ).toEqual([
            { key: "seq", value: 0 },
            { key: "serial_account", value: 0 },
            { key: "serial_idea", value: 0 },
            { key: "serial_work", value: 0 },
            { key: "snapshot_seq", value: 0 },
          ]);
          expect(db.prepare("PRAGMA user_version").get()).toEqual({
            user_version: 2,
          });
        } finally {
          db.close();
        }
      } finally {
        store.close();
      }
    });
  });

  it("从第 1 版升级前在 backups 生成一致备份，旧表和旧数据仍在备份里", async () => {
    await withDirectory(async (directory) => {
      const dbFile = join(directory, "nested", "store.sqlite");
      const versionOne = openStore(dbFile, {
        migrations: MIGRATIONS.slice(0, 1),
      });
      expect(versionOne.migration).toEqual({ from: 0, to: 1 });
      const oldDb = new DatabaseSync(dbFile);
      try {
        oldDb.exec("PRAGMA foreign_keys = ON");
        oldDb
          .prepare(
            "INSERT INTO works (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
          )
          .run("old-1", "升级前的旧记录", "created", "updated");
        oldDb
          .prepare(
            "INSERT INTO sources (id, work_id, kind, platform, ref, title, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "source-1",
            "old-1",
            "article",
            "blog",
            "ref-1",
            "来源",
            "hash",
            "created",
            "updated",
          );
        oldDb
          .prepare(
            "INSERT INTO assets (id, work_id, kind, path, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(
            "asset-1",
            "old-1",
            "markdown",
            "C:\\old.md",
            "asset-hash",
            "created",
          );
        oldDb
          .prepare(
            "INSERT INTO variants (id, work_id, source_id, platform, format, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "variant-1",
            "old-1",
            "source-1",
            "blog",
            "article",
            "draft",
            "created",
            "updated",
          );
        oldDb
          .prepare(
            "INSERT INTO publications (id, variant_id, platform, format, mode, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "publication-1",
            "variant-1",
            "blog",
            "article",
            "api",
            "published",
            "published",
          );
        oldDb
          .prepare(
            "INSERT INTO runs (id, workflow_id, params, state, cursor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run("run-1", "workflow-1", "{}", "running", 0, "created", "updated");
        oldDb
          .prepare(
            "INSERT INTO run_steps (run_id, step_id, idx, status) VALUES (?, ?, ?, ?)",
          )
          .run("run-1", "step-1", 0, "done");
      } finally {
        oldDb.close();
      }
      versionOne.close();

      const upgraded = openStore(dbFile);
      try {
        expect(upgraded.migration).toMatchObject({ from: 1, to: 2 });
        const backupPath = upgraded.migration.backupPath;
        expect(backupPath).toMatch(
          /[/\\]backups[/\\]store\.sqlite\.bak-v1-\d{17}-\d+$/,
        );
        expect(dirname(dirname(backupPath ?? ""))).toBe(dirname(dbFile));
        expect(await readdir(join(dirname(dbFile), "backups"))).toEqual([
          backupPath?.split(/[\\/]/).at(-1),
        ]);

        const backup = new DatabaseSync(backupPath ?? "", { readOnly: true });
        try {
          expect(backup.prepare("PRAGMA user_version").get()).toEqual({
            user_version: 1,
          });
          expect(
            backup.prepare("SELECT title FROM works WHERE id = ?").get("old-1"),
          ).toEqual({ title: "升级前的旧记录" });
          expect(backup.prepare("SELECT id FROM sources").all()).toEqual([
            { id: "source-1" },
          ]);
          expect(backup.prepare("SELECT id FROM assets").all()).toEqual([
            { id: "asset-1" },
          ]);
          expect(backup.prepare("SELECT id FROM variants").all()).toEqual([
            { id: "variant-1" },
          ]);
          expect(backup.prepare("SELECT id FROM publications").all()).toEqual([
            { id: "publication-1" },
          ]);
          expect(backup.prepare("SELECT id FROM runs").all()).toEqual([
            { id: "run-1" },
          ]);
          expect(
            backup.prepare("SELECT run_id, step_id FROM run_steps").all(),
          ).toEqual([{ run_id: "run-1", step_id: "step-1" }]);
          const oldTables = backup
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
            )
            .all()
            .map((row) => row.name);
          expect(oldTables).toEqual([
            "assets",
            "publications",
            "run_steps",
            "runs",
            "sources",
            "variants",
            "works",
          ]);
        } finally {
          backup.close();
        }

        const current = new DatabaseSync(dbFile, { readOnly: true });
        try {
          expect(
            current.prepare("SELECT id FROM works WHERE id = 'old-1'").get(),
          ).toBeUndefined();
          expect(current.prepare("SELECT account_id FROM works").all()).toEqual(
            [],
          );
          for (const table of [
            "assets",
            "publications",
            "run_steps",
            "runs",
            "sources",
            "variants",
          ]) {
            expect(
              current
                .prepare(
                  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
                )
                .get(table),
            ).toBeUndefined();
          }
        } finally {
          current.close();
        }
      } finally {
        upgraded.close();
      }
    });
  });
});
