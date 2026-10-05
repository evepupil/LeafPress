import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { openStore } from "../../src/store/open.js";
import { describeRunStoreContract } from "../contracts/run-store.contract.js";

const opened: { readonly directory: string; readonly close: () => void }[] = [];

async function createRunStore() {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-run-store-"));
  const store = openStore(join(directory, "store.sqlite"), {
    now: () => new Date("2026-10-05T00:01:00.000Z"),
  });
  opened.push({ directory, close: () => store.close() });
  return store.runs;
}

afterEach(async () => {
  for (const item of opened.splice(0)) {
    item.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

describeRunStoreContract("SQLite 存储", createRunStore);

it("completeStep 游标更新失败时回滚已写入的步骤", async () => {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-run-rollback-"));
  const dbFile = join(directory, "store.sqlite");
  const store = openStore(dbFile, {
    now: () => new Date("2026-10-05T00:01:00.000Z"),
  });
  opened.push({ directory, close: () => store.close() });
  const runId = "atomic-complete-step";
  const stepId = "rewrite";
  const timestamp = "2026-10-05T00:00:00.000Z";
  store.runs.createRun(
    {
      id: runId,
      workflowId: "demo",
      params: {},
      state: "running",
      cursor: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    [
      {
        runId,
        stepId,
        index: 0,
        status: "pending",
        inputHashes: {},
        attempts: 0,
      },
    ],
  );

  const sabotage = new DatabaseSync(dbFile);
  try {
    sabotage.exec(`
      CREATE TRIGGER fail_run_cursor_update
      BEFORE UPDATE ON runs
      BEGIN
        SELECT RAISE(ABORT, 'injected cursor update failure');
      END;
    `);
  } finally {
    sabotage.close();
  }

  expect(() =>
    store.runs.completeStep(
      runId,
      stepId,
      {
        status: "done",
        outputs: { result: "rewritten" },
        finishedAt: timestamp,
      },
      1,
    ),
  ).toThrow(expect.objectContaining({ code: "STORE_FAILED" }));

  const completedStep = store.runs.getSteps(runId)[0];
  expect(completedStep?.status).toBe("pending");
  expect(completedStep?.outputs).toBeUndefined();
  expect(completedStep?.finishedAt).toBeUndefined();
  expect(store.runs.getRun(runId)?.cursor).toBe(0);
});

it("接管后旧持有人不能续约或交还", async () => {
  const runs = await createRunStore();
  const run = {
    id: "expired-run",
    workflowId: "demo",
    params: {},
    state: "running" as const,
    cursor: 0,
    leaseOwner: "old-owner",
    leaseExpiresAt: "2026-10-05T00:00:00.000Z",
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  };
  runs.createRun(run, []);

  expect(
    runs.acquireRun("expired-run", {
      from: [],
      owner: "new-owner",
      leaseExpiresAt: "2026-10-05T02:00:00.000Z",
      now: "2026-10-05T00:01:00.000Z",
      takeOverExpired: true,
    }),
  ).toBe(true);
  expect(
    runs.renewLease("expired-run", "old-owner", "2026-10-05T03:00:00.000Z"),
  ).toBe(false);
  expect(runs.releaseRun("expired-run", "old-owner", "waiting")).toBe(false);
  expect(runs.getRun("expired-run")?.leaseOwner).toBe("new-owner");
});
