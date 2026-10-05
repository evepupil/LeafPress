import type { DatabaseSync } from "node:sqlite";

import { LeafPressError } from "../shared/errors.js";
import type { Migration, MigrationReport } from "./types.js";

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "建立记录库基础表",
    sql: `
      CREATE TABLE works (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id),
        kind TEXT NOT NULL,
        platform TEXT NOT NULL,
        ref TEXT NOT NULL,
        title TEXT NOT NULL,
        locale TEXT,
        content_hash TEXT NOT NULL,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (platform, ref)
      );

      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id),
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        mime TEXT,
        width INTEGER,
        height INTEGER,
        duration_seconds REAL,
        derived_from TEXT REFERENCES assets(id),
        created_at TEXT NOT NULL
      );

      CREATE TABLE variants (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id),
        source_id TEXT NOT NULL REFERENCES sources(id),
        platform TEXT NOT NULL,
        format TEXT NOT NULL,
        target_key TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        draft_path TEXT,
        options TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_variants_source
        ON variants (source_id, platform, format, target_key);

      CREATE TABLE publications (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL REFERENCES variants(id),
        platform TEXT NOT NULL,
        format TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        url TEXT,
        platform_content_id TEXT,
        published_at TEXT NOT NULL,
        note TEXT,
        raw TEXT
      );
      CREATE INDEX idx_publications_variant ON publications (variant_id);

      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        params TEXT NOT NULL,
        state TEXT NOT NULL,
        cursor INTEGER NOT NULL,
        error TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_runs_state ON runs (state, created_at);

      CREATE TABLE run_steps (
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        status TEXT NOT NULL,
        input_hashes TEXT NOT NULL DEFAULT '{}',
        outputs TEXT,
        wait TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        finished_at TEXT,
        PRIMARY KEY (run_id, step_id)
      );
    `,
  },
];

export interface MigrateOptions {
  readonly databaseExistedBeforeOpen?: boolean;
  readonly now?: () => Date;
}

export function expectedStoreVersion(
  migrations: readonly Migration[] = MIGRATIONS,
): number {
  return migrations.at(-1)?.version ?? 0;
}

export function migrate(
  db: DatabaseSync,
  dbFile: string,
  migrations: readonly Migration[] = MIGRATIONS,
  options: MigrateOptions = {},
): MigrationReport {
  validateMigrations(migrations);
  const expectedVersion = expectedStoreVersion(migrations);
  const from = readVersion(db);

  if (from > expectedVersion) {
    throw new LeafPressError(
      "MIGRATION_FAILED",
      `记录库版本为 ${from}，高于当前代码支持的版本 ${expectedVersion}。`,
      { hint: "请升级 LeafPress 后再打开此记录库。" },
    );
  }

  let backupPath: string | undefined;
  if (
    from > 0 &&
    from < expectedVersion &&
    options.databaseExistedBeforeOpen === true
  ) {
    backupPath = makeBackupPath(
      dbFile,
      from,
      (options.now ?? (() => new Date()))(),
    );
    try {
      db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    } catch (cause) {
      throw new LeafPressError(
        "MIGRATION_FAILED",
        "升级前备份记录库失败，未执行升级。",
        { hint: `请检查备份路径是否可写：${backupPath}`, cause },
      );
    }
  }

  for (const migration of migrations) {
    if (migration.version <= from) continue;
    try {
      db.exec("BEGIN IMMEDIATE");
      const currentVersion = readVersion(db);
      if (currentVersion > expectedVersion) {
        throw new LeafPressError(
          "MIGRATION_FAILED",
          `记录库版本为 ${currentVersion}，高于当前代码支持的版本 ${expectedVersion}。`,
          { hint: "请升级 LeafPress 后再打开此记录库。" },
        );
      }
      if (currentVersion >= migration.version) {
        db.exec("COMMIT");
        continue;
      }

      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (cause) {
      if (db.isTransaction) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // 保留升级脚本或提交失败的原始异常。
        }
      }
      throw new LeafPressError(
        "MIGRATION_FAILED",
        `记录库升级到第 ${migration.version} 版「${migration.name}」失败，已回滚本次升级。`,
        {
          hint: `备份文件：${backupPath ?? "无"}`,
          cause,
        },
      );
    }
  }

  return {
    from,
    to: expectedVersion,
    ...(backupPath === undefined ? {} : { backupPath }),
  };
}

function validateMigrations(migrations: readonly Migration[]): void {
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    if (migration?.version !== index + 1) {
      throw new LeafPressError(
        "MIGRATION_FAILED",
        "记录库升级脚本版本必须从 1 开始连续递增。",
        { hint: `第 ${index + 1} 个升级脚本的版本号不正确。` },
      );
    }
  }
}

function readVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare("PRAGMA user_version").get();
    const version = row?.user_version;
    if (typeof version !== "number" || !Number.isSafeInteger(version)) {
      throw new TypeError("PRAGMA user_version 未返回有效整数");
    }
    return version;
  } catch (cause) {
    throw new LeafPressError("MIGRATION_FAILED", "无法读取记录库版本。", {
      hint: "请检查记录库文件是否损坏。",
      cause,
    });
  }
}

function makeBackupPath(dbFile: string, version: number, now: Date): string {
  const timestamp = now.toISOString().replaceAll(/\D/g, "");
  return `${dbFile}.bak-v${version}-${timestamp}-${process.pid}`;
}
