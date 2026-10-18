import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";
import { MIGRATIONS } from "../../src/store/migrations.js";

const fixture = fileURLToPath(
  new URL("./fixtures/store-open-worker.ts", import.meta.url),
);
const directories = new Set<string>();

interface ChildResult {
  readonly code: number | null;
  readonly output: string;
}

interface RunningChild {
  readonly child: ChildProcess;
  readonly completion: Promise<ChildResult>;
}

afterEach(async () => {
  await Promise.all(
    [...directories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  directories.clear();
});

function startWorker(args: readonly string[]): RunningChild {
  const child = spawn(process.execPath, ["--import", "tsx", fixture, ...args], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    output += chunk;
  });
  const timeout = setTimeout(() => child.kill(), 60_000);
  const completion = new Promise<ChildResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
  return { child, completion };
}

async function waitForWorkers(
  directory: string,
  prefix: string,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const files = await readdir(directory);
    if (files.filter((file) => file.startsWith(prefix)).length === count)
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`并发打开子进程未就绪：${prefix}`);
}

async function runWorkers(
  dbFile: string,
  directory: string,
  prefix: string,
  count: number,
): Promise<ChildResult[]> {
  const gateFile = join(directory, `${prefix}-gate`);
  const workers = Array.from({ length: count }, (_, index) =>
    startWorker([
      dbFile,
      join(directory, `${prefix}-ready-${index}`),
      gateFile,
    ]),
  );
  let readinessFailure: unknown;
  try {
    await waitForWorkers(directory, `${prefix}-ready-`, count);
  } catch (error) {
    readinessFailure = error;
  }
  await writeFile(gateFile, "go", "utf8");
  const results = await Promise.all(workers.map((worker) => worker.completion));
  if (readinessFailure instanceof Error) throw readinessFailure;
  return results;
}

function parseReport(output: string): {
  readonly from: number;
  readonly to: number;
  readonly backupPath?: string;
} {
  const line = output.trim().split("\n").at(-1);
  if (line === undefined) throw new Error(`子进程没有迁移报告：${output}`);
  return JSON.parse(line) as {
    readonly from: number;
    readonly to: number;
    readonly backupPath?: string;
  };
}

describe("记录库并发打开", () => {
  it("多个子进程同时首次打开新库时只完成一次原子升级且不备份", async () => {
    const directory = await mkdtemp(join(tmpdir(), "leafpress-store-fresh-"));
    directories.add(directory);
    const dbFile = join(directory, "fresh", "store.sqlite");
    const results = await runWorkers(dbFile, directory, "fresh", 6);
    for (const result of results) expect(result.code, result.output).toBe(0);
    const reports = results.map((result) => parseReport(result.output));
    expect(reports.every((report) => report.to === 3)).toBe(true);
    expect(
      reports.every((report) => report.from === 0 || report.from === 3),
    ).toBe(true);
    expect(reports.every((report) => report.backupPath === undefined)).toBe(
      true,
    );
    expect(existsSync(join(directory, "fresh", "backups"))).toBe(false);

    const store = openStore(dbFile);
    expect(store.migration).toEqual({ from: 3, to: 3 });
    store.close();
  }, 90_000);

  it("多个子进程同时从第 1 版升级时只保留胜者的备份", async () => {
    const directory = await mkdtemp(join(tmpdir(), "leafpress-store-upgrade-"));
    directories.add(directory);
    const dbFile = join(directory, "upgrade", "store.sqlite");
    const versionOne = openStore(dbFile, {
      migrations: MIGRATIONS.slice(0, 1),
    });
    versionOne.close();
    const oldDb = new DatabaseSync(dbFile);
    try {
      oldDb
        .prepare(
          "INSERT INTO works (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run("old-work", "升级前记录", "created", "updated");
    } finally {
      oldDb.close();
    }

    const results = await runWorkers(dbFile, directory, "upgrade", 6);
    for (const result of results) expect(result.code, result.output).toBe(0);
    const reports = results.map((result) => parseReport(result.output));
    expect(reports.every((report) => report.to === 3)).toBe(true);
    expect(
      reports.filter((report) => report.backupPath !== undefined),
    ).toHaveLength(1);
    expect(
      reports.every((report) => report.from === 1 || report.from === 3),
    ).toBe(true);

    const backupPath = reports.find((report) => report.backupPath)?.backupPath;
    if (backupPath === undefined) throw new Error("升级进程没有生成备份。");
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try {
      expect(backup.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 1,
      });
      expect(
        backup.prepare("SELECT title FROM works WHERE id = ?").get("old-work"),
      ).toEqual({ title: "升级前记录" });
    } finally {
      backup.close();
    }
    expect(await readdir(join(directory, "upgrade", "backups"))).toEqual([
      backupPath.split(/[\\/]/).at(-1),
    ]);

    const upgraded = openStore(dbFile);
    expect(upgraded.migration).toEqual({ from: 3, to: 3 });
    upgraded.close();
  }, 90_000);
});
