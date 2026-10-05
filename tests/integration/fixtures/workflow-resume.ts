import { existsSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { LeafPressError } from "../../../src/shared/errors.js";
import { openStore } from "../../../src/store/open.js";
import { createWorkflowEngine } from "../../../src/workflows/engine.js";
import type {
  StepContext,
  WorkflowDefinition,
  WorkflowParams,
} from "../../../src/workflows/types.js";

interface IntegrationParams extends WorkflowParams {
  readonly counterFile: string;
}

function parseParams(raw: unknown): IntegrationParams {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("counterFile" in raw) ||
    typeof raw.counterFile !== "string"
  ) {
    throw new LeafPressError("USAGE", "counterFile is required");
  }
  return { counterFile: raw.counterFile };
}

const workflow: WorkflowDefinition<IntegrationParams> = {
  id: "integration-resume-race",
  title: "集成测试工作流",
  parseParams,
  steps: [
    {
      id: "code-step",
      kind: "code",
      title: "准备代码步骤",
      inputFiles: () => [],
      async run(context: StepContext<IntegrationParams>) {
        await writeFile(
          join(context.stepDir, "completed.txt"),
          "ready\n",
          "utf8",
        );
        return { type: "done", outputs: { prepared: true } };
      },
    },
    {
      id: "ai-step",
      kind: "ai",
      title: "等待恢复的 AI 步骤",
      inputFiles: () => [],
      async run(context: StepContext<IntegrationParams>) {
        const taskFile = join(context.stepDir, "task.md");
        const outputFile = join(context.stepDir, "output.md");
        if (context.resume === undefined) {
          await writeFile(taskFile, "integration task\n", "utf8");
          return {
            type: "wait",
            wait: {
              kind: "ai",
              message: "等待集成测试恢复",
              taskFile,
              outputFile,
            },
          };
        }
        await mkdir(dirname(context.params.counterFile), { recursive: true });
        await appendFile(context.params.counterFile, "resumed\n", "utf8");
        return { type: "done", outputs: { resumed: true } };
      },
    },
  ],
};

const [mode, dbFile, runsDir, runIdOrCounterFile, readyFile, gateFile] =
  process.argv.slice(2);
if (mode === undefined || dbFile === undefined || runsDir === undefined) {
  throw new Error("expected mode, dbFile and runsDir");
}

const store = openStore(dbFile);
try {
  const engine = createWorkflowEngine({
    store: store.runs,
    workflows: [workflow],
    runsDir,
  });
  if (mode === "prepare") {
    if (runIdOrCounterFile === undefined) {
      throw new Error("prepare mode requires counterFile");
    }
    const report = await engine.start(workflow.id, {
      counterFile: runIdOrCounterFile,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, report })}\n`);
  } else if (mode === "resume") {
    if (
      runIdOrCounterFile === undefined ||
      readyFile === undefined ||
      gateFile === undefined
    ) {
      throw new Error("resume mode requires runId, readyFile and gateFile");
    }
    writeFileSync(readyFile, String(process.pid));
    while (!existsSync(gateFile)) await delay(10);
    try {
      const report = await engine.resume(runIdOrCounterFile);
      process.stdout.write(`${JSON.stringify({ ok: true, report })}\n`);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "UNKNOWN";
      process.stdout.write(`${JSON.stringify({ ok: false, code })}\n`);
      if (code !== "RUN_STATE_CONFLICT") process.exitCode = 1;
    }
  } else {
    throw new Error(`unknown mode: ${mode}`);
  }
} finally {
  store.close();
}
