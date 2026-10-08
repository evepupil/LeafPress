import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";
import { account, work } from "../store/helpers.js";

const fixture = fileURLToPath(
  new URL("./fixtures/store-concurrency-worker.ts", import.meta.url),
);
const consistencyFixture = fileURLToPath(
  new URL("./fixtures/store-consistency-worker.ts", import.meta.url),
);
const directories = new Set<string>();

interface ChildResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
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

function startWorker(args: readonly string[], script = fixture): RunningChild {
  const child = spawn(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 60_000);
  const completion = new Promise<ChildResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`store concurrency worker timed out: ${stderr}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
  return { child, completion };
}

async function waitForWorkers(directory: string, count = 2): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const files = await readdir(directory);
    if (
      files.filter((file) => file.startsWith("worker-ready-")).length === count
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("两个记录库并发子进程未就绪。");
}

describe("记录库跨进程并发", () => {
  it("两个进程的编号不重复，事务内读改写的记录总数为 100", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-concurrency-"),
    );
    directories.add(directory);
    const dbFile = join(directory, "store.sqlite");
    const store = openStore(dbFile);
    store.accounts.insert(account());
    store.works.insert(work("shared-work"));
    store.close();

    const gateFile = join(directory, "release-workers");
    const workers = [1, 2].map((index) =>
      startWorker([
        dbFile,
        "shared-work",
        join(directory, `worker-ready-${index}`),
        gateFile,
        String(index),
      ]),
    );
    let readinessFailure: unknown;
    try {
      await waitForWorkers(directory);
    } catch (error) {
      readinessFailure = error;
    }
    await writeFile(gateFile, "go", "utf8");
    const results = await Promise.all(
      workers.map((worker) => worker.completion),
    );
    expect(readinessFailure).toBeUndefined();
    expect(results.map((result) => result.code)).toEqual([0, 0]);
    expect(results.map((result) => result.stderr)).toEqual(["", ""]);
    const serials = results.flatMap(
      (result) => (JSON.parse(result.stdout) as { serials: number[] }).serials,
    );
    expect(serials).toHaveLength(100);
    expect(new Set(serials).size).toBe(100);
    expect([...serials].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );

    const finalStore = openStore(dbFile);
    try {
      const finalWork = finalStore.works.get("shared-work");
      expect(finalWork?.log).toHaveLength(100);
      expect(new Set(finalWork?.log.map((entry) => entry.text)).size).toBe(100);
    } finally {
      finalStore.close();
    }
  }, 90_000);

  it("并发读事务始终读到同一版本的作品、记录和反馈", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-read-consistency-"),
    );
    directories.add(directory);
    const dbFile = join(directory, "store.sqlite");
    const store = openStore(dbFile);
    store.accounts.insert(account());
    store.works.insert(work("shared-work"));
    store.close();

    const gateFile = join(directory, "release-consistency-workers");
    const stopFile = join(directory, "stop-reader");
    const writers = [1, 2, 3, 4].map((workerId) =>
      startWorker(
        [
          dbFile,
          "shared-work",
          join(directory, `worker-ready-writer-${workerId}`),
          gateFile,
          "writer",
          String(workerId),
          stopFile,
        ],
        consistencyFixture,
      ),
    );
    const reader = startWorker(
      [
        dbFile,
        "shared-work",
        join(directory, "worker-ready-reader"),
        gateFile,
        "reader",
        "reader",
        stopFile,
      ],
      consistencyFixture,
    );
    let readinessFailure: unknown;
    try {
      await waitForWorkers(directory, 5);
    } catch (error) {
      readinessFailure = error;
    }
    await writeFile(gateFile, "go", "utf8");
    let writerResults: ChildResult[];
    try {
      writerResults = await Promise.all(
        writers.map((worker) => worker.completion),
      );
    } finally {
      await writeFile(stopFile, "stop", "utf8");
    }
    const readerResult = await reader.completion;

    expect(readinessFailure).toBeUndefined();
    expect(writerResults.map((result) => result.code)).toEqual([0, 0, 0, 0]);
    expect(writerResults.map((result) => result.stderr)).toEqual([
      "",
      "",
      "",
      "",
    ]);
    expect(readerResult.code).toBe(0);
    expect(readerResult.stderr).toBe("");
    const readReport = JSON.parse(readerResult.stdout) as {
      reads: number;
      mismatches: number;
    };
    expect(readReport.reads).toBeGreaterThan(0);
    expect(readReport.mismatches).toBe(0);

    const finalStore = openStore(dbFile);
    try {
      const finalWork = finalStore.works.get("shared-work");
      expect(finalWork?.log).toHaveLength(200);
      expect(finalWork?.feedbackHistory).toHaveLength(200);
      expect(finalStore.meta.version()).toEqual({ seq: 202, snapshotSeq: 0 });
    } finally {
      finalStore.close();
    }
  }, 90_000);
});
