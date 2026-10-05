import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";
import { MIGRATIONS } from "../../src/store/migrations.js";
import type { Store } from "../../src/store/types.js";

async function withDirectory<T>(
  fn: (dbFile: string, directory: string) => T | Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-store-open-"));
  try {
    return await fn(join(directory, "nested", "store.sqlite"), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const concurrentOpenScript = `
import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { openStore } from "./src/store/open.ts";
import { MIGRATIONS } from "./src/store/migrations.ts";

const [dbFile, gateFile, mode] = process.argv.slice(1);
writeFileSync(gateFile + "-" + process.pid, "ready");
while (!existsSync(gateFile)) await delay(5);
const migrations = mode === "upgrade"
  ? [...MIGRATIONS, {
      version: 2,
      name: "并发升级测试",
      sql: "CREATE TABLE concurrent_upgrade (id TEXT PRIMARY KEY);",
    }]
  : MIGRATIONS;
const store = openStore(dbFile, { migrations });
store.close();
`;

async function waitForReadyProcesses(
  directory: string,
  prefix: string,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const ready = (await readdir(directory)).filter((file) =>
      file.startsWith(prefix),
    ).length;
    if (ready >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`子进程未就绪：${prefix}`);
}

async function runConcurrentOpens(
  dbFile: string,
  directory: string,
  gateName: string,
  mode: "fresh" | "upgrade",
  count = 6,
): Promise<{ readonly code: number | null; readonly output: string }[]> {
  const gateFile = join(directory, gateName);
  await mkdir(dirname(dbFile), { recursive: true });
  const children = Array.from(
    { length: count },
    () =>
      new Promise<{ code: number | null; output: string }>((resolve) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "--input-type=module",
            "-e",
            concurrentOpenScript,
            dbFile,
            gateFile,
            mode,
          ],
          { cwd: process.cwd(), windowsHide: true },
        );
        let output = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.once("error", (error) =>
          resolve({ code: null, output: error.message }),
        );
        child.once("close", (code) => resolve({ code, output }));
      }),
  );

  let readinessError: unknown;
  try {
    await waitForReadyProcesses(directory, `${gateName}-`, count);
  } catch (error) {
    readinessError = error;
  }
  await writeFile(gateFile, "go");
  const results = await Promise.all(children);
  if (readinessError !== undefined) {
    if (readinessError instanceof Error) throw readinessError;
    throw new Error("并发打开子进程未就绪。");
  }
  return results;
}

describe("打开记录库", () => {
  it("新建目录和数据库，第一次与再次打开的升级报告正确", async () => {
    await withDirectory((dbFile) => {
      expect(existsSync(dbFile)).toBe(false);
      const first = openStore(dbFile, {
        now: () => new Date("2026-10-05T00:00:00.000Z"),
        newId: () => "work-1",
      });
      try {
        expect(first.migration).toEqual({ from: 0, to: 1 });
        expect(existsSync(dbFile)).toBe(true);
        expect(first.works.create({ title: "打开测试" }).id).toBe("work-1");
      } finally {
        first.close();
      }

      const second = openStore(dbFile);
      try {
        expect(second.migration).toEqual({ from: 1, to: 1 });
        const db = new DatabaseSync(dbFile, { readOnly: true });
        try {
          expect(db.prepare("PRAGMA journal_mode").get()).toEqual({
            journal_mode: "wal",
          });
          expect(
            db
              .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
              .all()
              .map((row) => row.name),
          ).toContain("run_steps");
        } finally {
          db.close();
        }
      } finally {
        second.close();
      }
    });
  });

  it("多个进程同时打开新库和升级同一个旧库", async () => {
    await withDirectory(async (_dbFile, directory) => {
      const freshDbFile = join(directory, "fresh", "store.sqlite");
      const freshResults = await runConcurrentOpens(
        freshDbFile,
        directory,
        "fresh-start",
        "fresh",
      );
      for (const result of freshResults) {
        expect(result, result.output).toMatchObject({ code: 0 });
      }
      const fresh = openStore(freshDbFile);
      expect(fresh.migration).toEqual({ from: 1, to: 1 });
      fresh.close();

      const upgradeDbFile = join(directory, "upgrade", "store.sqlite");
      const initial = openStore(upgradeDbFile);
      initial.close();
      const upgradeResults = await runConcurrentOpens(
        upgradeDbFile,
        directory,
        "upgrade-start",
        "upgrade",
      );
      for (const result of upgradeResults) {
        expect(result, result.output).toMatchObject({ code: 0 });
      }

      const migrations = [
        ...MIGRATIONS,
        {
          version: 2,
          name: "并发升级测试",
          sql: "CREATE TABLE concurrent_upgrade (id TEXT PRIMARY KEY);",
        },
      ];
      const upgraded = openStore(upgradeDbFile, { migrations });
      expect(upgraded.migration).toEqual({ from: 2, to: 2 });
      upgraded.close();
      const backupFiles = await readdir(dirname(upgradeDbFile));
      expect(
        backupFiles.filter((file) =>
          /^store\.sqlite\.bak-v1-\d{17}-\d+$/.test(file),
        ),
      ).not.toHaveLength(0);
    });
  });

  it("每个打开的库连接都启用外键约束", async () => {
    await withDirectory((dbFile) => {
      const initialized = openStore(dbFile);
      initialized.close();

      const seed = new DatabaseSync(dbFile, {
        enableForeignKeyConstraints: false,
      });
      try {
        seed
          .prepare(
            `INSERT INTO sources (
            id, work_id, kind, platform, ref, title, content_hash,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "orphan-source",
            "missing-work",
            "article",
            "blog",
            "orphan",
            "孤立原稿",
            "hash",
            "2026-10-05T00:00:00.000Z",
            "2026-10-05T00:00:00.000Z",
          );
      } finally {
        seed.close();
      }

      const store = openStore(dbFile);
      try {
        expect(() =>
          store.variants.create({
            sourceId: "orphan-source",
            platform: "blog",
            format: "article",
          }),
        ).toThrow(expect.objectContaining({ code: "STORE_FAILED" }));
      } finally {
        store.close();
      }
    });
  });

  it("transaction 提交、回滚、支持 Repo 参与且拒绝嵌套", async () => {
    await withDirectory((dbFile) => {
      const store: Store = openStore(dbFile, {
        newId: (() => {
          let id = 0;
          return () => `id-${++id}`;
        })(),
      });
      try {
        store.transaction(() => {
          store.sources.upsert({
            platform: "blog",
            kind: "article",
            ref: "zh/committed",
            title: "提交",
            contentHash: "hash-1",
          });
        });
        expect(store.sources.list().map((source) => source.ref)).toEqual([
          "zh/committed",
        ]);

        const failure = new Error("事务原始错误");
        expect(() =>
          store.transaction(() => {
            store.sources.upsert({
              platform: "blog",
              kind: "article",
              ref: "zh/rolled-back",
              title: "回滚",
              contentHash: "hash-2",
            });
            throw failure;
          }),
        ).toThrow(failure);
        expect(store.sources.list().map((source) => source.ref)).toEqual([
          "zh/committed",
        ]);
        expect(() =>
          store.transaction(() => store.transaction(() => undefined)),
        ).toThrow("记录库事务不支持嵌套调用。");
      } finally {
        store.close();
      }
    });
  });
});
