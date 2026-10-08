import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openApp, closeApp, createUseCases } from "../../src/usecases/index.js";

const workerFixture = fileURLToPath(
  new URL("./fixtures/next-worker.ts", import.meta.url),
);
const directories = new Set<string>();

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface WorkerOutput {
  id: string | null;
  startedAt: number;
  finishedAt: number;
}

interface RunningChild {
  child: ChildProcess;
  completion: Promise<ChildResult>;
}

function launch(
  home: string,
  readyFile: string,
  gateFile: string,
): RunningChild {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", workerFixture, home, readyFile, gateFile],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const timeout = setTimeout(() => child.kill(), 60_000);
  return {
    child,
    completion: new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve({ code, stdout, stderr });
      });
    }),
  };
}

async function waitUntilReady(
  directory: string,
  expected: number,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const names = await readdir(directory);
    if (names.filter((name) => name.startsWith("ready-")).length === expected)
      return;
    await delay(20);
  }
  throw new Error("startNext 测试子进程没有全部就绪");
}

async function raceNext(count: number): Promise<WorkerOutput[]> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-next-race-"));
  directories.add(directory);
  const home = join(directory, "home");
  const seed = openApp({ home });
  try {
    const usecases = createUseCases(seed);
    const accounts = Array.from({ length: count }, (_, index) =>
      usecases.addAccount({
        platform: "blog",
        name: `并发账号${index + 1}`,
        intro: "",
      }),
    );
    usecases.createWorks({
      source: { kind: "new", title: "并发作品" },
      accountIds: accounts.map((account) => account.id),
      brief: "并发 next",
    });
  } finally {
    closeApp(seed);
  }

  const gate = join(directory, "go");
  const children = [1, 2].map((index) =>
    launch(home, join(directory, `ready-${index}`), gate),
  );
  try {
    await waitUntilReady(directory, children.length);
  } finally {
    await writeFile(gate, "go", "utf8");
  }
  const results = await Promise.all(
    children.map((worker) => worker.completion),
  );
  expect(results.map((result) => result.code)).toEqual([0, 0]);
  expect(results.map((result) => result.stderr)).toEqual(["", ""]);
  return results.map((result) => JSON.parse(result.stdout) as WorkerOutput);
}

afterEach(async () => {
  await Promise.all(
    [...directories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  directories.clear();
});

describe("startNext 跨进程并发", () => {
  it("4. 两进程多轮重叠领取不同作品；最后一个作品仅能领取一次", async () => {
    for (let round = 0; round < 4; round += 1) {
      const results = await raceNext(3);
      expect(results).toHaveLength(2);
      expect(results[0]!.startedAt).toBeLessThanOrEqual(results[1]!.finishedAt);
      expect(results[1]!.startedAt).toBeLessThanOrEqual(results[0]!.finishedAt);
      const assigned = results.map((result) => result.id).filter(Boolean);
      expect(assigned).toHaveLength(2);
      expect(new Set(assigned).size).toBe(2);
    }
    for (let round = 0; round < 3; round += 1) {
      const results = await raceNext(1);
      expect(results[0]!.startedAt).toBeLessThanOrEqual(results[1]!.finishedAt);
      expect(results[1]!.startedAt).toBeLessThanOrEqual(results[0]!.finishedAt);
      expect(results.filter((result) => result.id !== null)).toHaveLength(1);
      expect(results.filter((result) => result.id === null)).toHaveLength(1);
    }
  }, 120_000);
});
