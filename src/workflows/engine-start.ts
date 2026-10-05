import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { LeafPressError } from "../shared/errors.js";
import type { RunRecord, StepRecord, WorkflowParams } from "./types.js";
import { newRunId as defaultNewRunId } from "./run-id.js";
import type { ExecutionContext } from "./engine-shared.js";
import { getWorkflowOrThrow, leaseExpiry, nowDate } from "./engine-shared.js";
import { progressRun } from "./engine-progress.js";

export async function startRun(
  context: ExecutionContext,
  workflowId: string,
  rawParams: unknown,
) {
  const workflow = getWorkflowOrThrow(context, workflowId);
  const params = workflow.parseParams(rawParams) as WorkflowParams;
  const now = nowDate(context);
  const runId = (context.deps.newRunId ?? defaultNewRunId)(now);
  const runDir = join(context.deps.runsDir, runId);

  try {
    await mkdir(runDir, { recursive: true });
  } catch (error) {
    throw new LeafPressError("INTERNAL", `无法创建运行目录「${runId}」`, {
      cause: error,
    });
  }

  const createdAt = now.toISOString();
  const run: RunRecord = {
    id: runId,
    workflowId,
    params,
    state: "running",
    cursor: 0,
    leaseOwner: context.owner,
    leaseExpiresAt: leaseExpiry(context, now),
    createdAt,
    updatedAt: createdAt,
  };
  const records: StepRecord[] = workflow.steps.map((step, index) => ({
    runId,
    stepId: step.id,
    index,
    status: "pending",
    inputHashes: {},
    attempts: 0,
  }));
  context.deps.store.createRun(run, records);
  return progressRun(context, runId, workflow, params);
}
