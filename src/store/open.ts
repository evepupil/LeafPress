import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LeafPressError } from "../shared/errors.js";
import { createAccountsRepo } from "./accounts.js";
import { createIdeasRepo } from "./ideas.js";
import { createMetaRepo } from "./meta.js";
import { migrate, MIGRATIONS } from "./migrations.js";
import { createNotesRepo } from "./notes.js";
import { createPullsRepo } from "./pulls.js";
import {
  storeFailed,
  storeOperation,
  createTransactionFunctions,
} from "./sql.js";
import { createSettingsRepo } from "./settings.js";
import { createSnapshotsRepo } from "./snapshots.js";
import type { OpenStoreOptions, Store } from "./types.js";
import { createWorksRepo } from "./works.js";

export function openStore(
  dbFile: string,
  options: OpenStoreOptions = {},
): Store {
  const databaseExistedBeforeOpen = dbFile !== ":memory:" && existsSync(dbFile);
  let db: DatabaseSync | undefined;
  try {
    if (dbFile !== ":memory:")
      mkdirSync(dirname(resolve(dbFile)), { recursive: true });
    db = new DatabaseSync(dbFile);
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");
    enableWalMode(db);

    const migration = migrate(db, dbFile, options.migrations ?? MIGRATIONS, {
      databaseExistedBeforeOpen,
    });
    const transactions = createTransactionFunctions(db);
    const context = {
      db,
      now: () => new Date(),
      newId: randomUUID,
      ...transactions,
    };

    return {
      accounts: createAccountsRepo(context),
      settings: createSettingsRepo(context),
      ideas: createIdeasRepo(context),
      works: createWorksRepo(context),
      snapshots: createSnapshotsRepo(context),
      pulls: createPullsRepo(context),
      notes: createNotesRepo(context),
      meta: createMetaRepo(context),
      migration,
      transaction<T>(fn: () => T): T {
        return transactions.withTransaction(fn);
      },
      backupTo(target: string): void {
        storeOperation(
          "导出记录库备份失败，检查目标文件及目录是否可写。",
          () => {
            mkdirSync(dirname(resolve(target)), { recursive: true });
            db?.exec(`VACUUM INTO '${resolve(target).replaceAll("'", "''")}'`);
          },
        );
      },
      close(): void {
        if (db?.isOpen) db.close();
      },
    };
  } catch (cause) {
    if (db?.isOpen) db.close();
    if (cause instanceof LeafPressError) throw cause;
    throw storeFailed("打开记录库失败。", cause);
  }
}

function enableWalMode(db: DatabaseSync): void {
  const deadline = Date.now() + 5_000;
  const waitCell = new Int32Array(new SharedArrayBuffer(4));
  while (true) {
    try {
      db.exec("PRAGMA journal_mode = WAL");
      return;
    } catch (cause) {
      if (!isSqliteBusy(cause) || Date.now() >= deadline) throw cause;
      Atomics.wait(waitCell, 0, 0, 25);
    }
  }
}

function isSqliteBusy(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const errcode = (cause as Error & { errcode?: unknown }).errcode;
  return (
    typeof errcode === "number" &&
    ((errcode & 0xff) === 5 || (errcode & 0xff) === 6)
  );
}
