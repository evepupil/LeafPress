import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

const fixtureScript = fileURLToPath(
  new URL("./fixtures/publication-begin.ts", import.meta.url),
);
const temporaryDirectories = new Set<string>();

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
    [...temporaryDirectories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.clear();
});

function startWorker(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): RunningChild {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", fixtureScript, ...args],
    {
      cwd: process.cwd(),
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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
  }, 55_000);
  const completion = new Promise<ChildResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`publication worker timed out: ${stderr}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
  return { child, completion };
}

async function waitForReadyFiles(directory: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const readyFiles = (await readdir(directory)).filter((name) =>
      name.startsWith("worker-ready-"),
    );
    if (readyFiles.length === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("both publication workers did not become ready");
}

describe("跨进程发布防重", () => {
  it("两个进程同时 begin 同一目标时只有一个登记成功", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-integration-publication-"),
    );
    temporaryDirectories.add(directory);
    const home = join(directory, "leafpress-home");
    const userHome = join(directory, "user-home");
    await Promise.all([
      mkdir(home, { recursive: true }),
      mkdir(userHome, { recursive: true }),
    ]);

    const dbFile = join(home, "leafpress.db");
    const store = openStore(dbFile);
    const source = store.sources.upsert({
      platform: "blog",
      kind: "article",
      ref: "zh/concurrent-publish",
      title: "并发发布原稿",
      contentHash: "integration-hash",
    }).source;
    const variant = store.variants.create({
      sourceId: source.id,
      platform: "zhihu",
      format: "article",
    });
    store.close();

    const gateFile = join(directory, "release-workers");
    const workerArgs = (index: number) => [
      dbFile,
      variant.id,
      join(directory, `worker-ready-${index}`),
      gateFile,
    ];
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      LEAFPRESS_HOME: home,
      HOME: userHome,
      USERPROFILE: userHome,
    };
    const workers = [
      startWorker(workerArgs(1), environment),
      startWorker(workerArgs(2), environment),
    ];

    let readinessFailure: unknown;
    try {
      await waitForReadyFiles(directory);
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
    const outcomes = results.map(
      (result) =>
        JSON.parse(result.stdout) as
          { ok: true; id: string } | { ok: false; code: string },
    );
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.code),
    ).toEqual([
      expect.stringMatching(/^(ALREADY_PUBLISHED|PUBLISH_IN_DOUBT)$/),
    ]);

    const reopened = openStore(dbFile);
    expect(reopened.publications.listByVariant(variant.id)).toHaveLength(1);
    expect(
      reopened
        .publicationOverview([source.id])
        .filter((row) => row.platform === "zhihu" && row.format === "article"),
    ).toHaveLength(1);
    reopened.close();
  }, 60_000);
});
