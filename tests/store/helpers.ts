import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AccountRow, Store } from "../../src/store/types.js";
import { openStore } from "../../src/store/open.js";
import type { Work } from "@leafpress/core";

export async function withStore<T>(
  run: (store: Store, dbFile: string, directory: string) => T | Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-store-test-"));
  const dbFile = join(directory, "nested", "store.sqlite");
  let store: Store | undefined;
  try {
    store = openStore(dbFile);
    return await run(store, dbFile, directory);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export function account(id = "blog-1"): AccountRow {
  return {
    id,
    platform: "blog",
    name: "中文账号",
    stage: "active",
    since: "2026-01-01",
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: "2026-01-01T00:00:00+08:00",
  };
}

export function work(id = "work-1", overrides: Partial<Work> = {}): Work {
  return {
    id,
    title: "中文作品",
    accountId: "blog-1",
    status: "todo",
    brief: "写一篇文章",
    source: { kind: "none" },
    workflowId: "blog-article",
    step: 0,
    feedbackHistory: [],
    order: 1,
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: "2026-01-01T00:00:00+08:00",
    tags: [],
    log: [],
    ...overrides,
  };
}
