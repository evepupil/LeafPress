import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LeafPressError } from "../shared/errors.js";
import type { OpenStoreOptions, Store } from "./types.js";
import { createPublicationOverview } from "./overview.js";
import { createPublicationsRepo } from "./publications.js";
import { createRunsStore } from "./runs.js";
import { createSourcesRepo } from "./sources.js";
import { createTransactionFunctions, storeFailed } from "./sql.js";
import { createVariantsRepo } from "./variants.js";
import { createWorksRepo } from "./works.js";
import { MIGRATIONS, migrate } from "./migrations.js";

export function openStore(
  dbFile: string,
  options: OpenStoreOptions = {},
): Store {
  const databaseExistedBeforeOpen = existsSync(dbFile);

  let db: DatabaseSync | undefined;
  try {
    if (dbFile !== ":memory:") {
      mkdirSync(dirname(resolve(dbFile)), { recursive: true });
    }
    db = new DatabaseSync(dbFile);
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");
    enableWalMode(db);

    const migration = migrate(db, dbFile, options.migrations ?? MIGRATIONS, {
      databaseExistedBeforeOpen,
      now: options.now,
    });
    const transactions = createTransactionFunctions(db);
    const context = {
      db,
      now: options.now ?? (() => new Date()),
      newId: options.newId ?? randomUUID,
      ...transactions,
    };

    return {
      works: createWorksRepo(context),
      sources: createSourcesRepo(context),
      variants: createVariantsRepo(context),
      publications: createPublicationsRepo(context),
      runs: createRunsStore(context),
      migration,
      publicationOverview: createPublicationOverview(context),
      transaction<T>(fn: () => T): T {
        return transactions.transaction(fn);
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
