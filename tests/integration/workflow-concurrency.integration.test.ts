import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

const fixtureScript = fileURLToPath(
  new URL("./fixtures/workflow-resume.ts", import.meta.url),
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

type WorkerOutput =
  | { readonly ok: true; readonly report: { readonly state: string } }
  | { readonly ok: false; readonly code: string };

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
        reject(new Error(`workflow worker timed out: ${stderr}`));
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
      name.startsWith("resume-ready-"),
    );
    if (readyFiles.length === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("both workflow workers did not become ready");
}

describe("跨进程工作流执行权", () => {
  it("同时恢复同一次等待运行时只有一个进程推进 AI 步骤", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-integration-workflow-"),
    );
    temporaryDirectories.add(directory);
    const home = join(directory, "leafpress-home");
    const userHome = join(directory, "user-home");
    const runsDir = join(home, "runs");
    await Promise.all([
      mkdir(home, { recursive: true }),
      mkdir(userHome, { recursive: true }),
    ]);
    const dbFile = join(home, "leafpress.db");
    const counterFile = join(directory, "resumed-count.txt");
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      LEAFPRESS_HOME: home,
      HOME: userHome,
      USERPROFILE: userHome,
    };

    const prepare = startWorker(
      ["prepare", dbFile, runsDir, counterFile],
      environment,
    );
    const prepared = await prepare.completion;
    expect(prepared.code, prepared.stderr).toBe(0);
    const prepareOutput = JSON.parse(prepared.stdout) as {
      ok: boolean;
      report: { runId: string; state: string; wait?: { kind: string } };
    };
    expect(prepareOutput.ok).toBe(true);
    expect(prepareOutput.report.state).toBe("waiting");
    expect(prepareOutput.report.wait?.kind).toBe("ai");
    const runId = prepareOutput.report.runId;

    const beforeStore = openStore(dbFile);
    const beforeSteps = beforeStore.runs.getSteps(runId);
    const initialAiStep = beforeSteps.find((step) => step.stepId === "ai-step");
    expect(initialAiStep).toMatchObject({ status: "waiting", attempts: 1 });
    beforeStore.close();

    const gateFile = join(directory, "release-resume-workers");
    const workers = [1, 2].map((index) =>
      startWorker(
        [
          "resume",
          dbFile,
          runsDir,
          runId,
          join(directory, `resume-ready-${index}`),
          gateFile,
        ],
        environment,
      ),
    );

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
      (result) => JSON.parse(result.stdout) as WorkerOutput,
    );
    const successful = outcomes.filter((outcome) => outcome.ok);
    const conflicts = outcomes.filter((outcome) => !outcome.ok);
    expect(successful).toHaveLength(1);
    expect(successful[0]).toMatchObject({
      ok: true,
      report: { state: "completed" },
    });
    expect(conflicts).toEqual([{ ok: false, code: "RUN_STATE_CONFLICT" }]);

    const reopened = openStore(dbFile);
    expect(reopened.runs.getRun(runId)?.state).toBe("completed");
    const finalSteps = reopened.runs.getSteps(runId);
    const finalCodeStep = finalSteps.find(
      (step) => step.stepId === "code-step",
    );
    const finalAiStep = finalSteps.find((step) => step.stepId === "ai-step");
    expect(finalCodeStep?.attempts).toBe(1);
    expect(finalAiStep).toMatchObject({ status: "done", attempts: 2 });
    reopened.close();
    expect(await readFile(counterFile, "utf8")).toBe("resumed\n");
  }, 60_000);
});
