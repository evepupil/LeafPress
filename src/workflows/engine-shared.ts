import { randomUUID } from "node:crypto";

import { LeafPressError } from "../shared/errors.js";
import type { RunRecord, RunReport } from "./types.js";
import type { EngineDeps, ErasedWorkflowDefinition } from "./engine.js";

export interface EngineContext {
  readonly deps: EngineDeps;
  readonly workflows: ReadonlyMap<string, ErasedWorkflowDefinition>;
}

export interface ExecutionContext extends EngineContext {
  readonly owner: string;
}

export function createExecutionContext(
  context: EngineContext,
): ExecutionContext {
  return {
    ...context,
    owner: context.deps.newOwnerToken?.() ?? randomUUID(),
  };
}

export function nowDate(context: EngineContext): Date {
  return context.deps.now?.() ?? new Date();
}

export function leaseExpiry(
  context: EngineContext,
  at = nowDate(context),
): string {
  return new Date(
    at.getTime() + (context.deps.leaseMs ?? 10 * 60 * 1000),
  ).toISOString();
}

export function getRunOrThrow(
  context: EngineContext,
  runId: string,
): RunRecord {
  const run = context.deps.store.getRun(runId);
  if (!run) {
    throw new LeafPressError("RUN_NOT_FOUND", `找不到运行「${runId}」`);
  }
  return run;
}

export function getWorkflowOrThrow(
  context: EngineContext,
  workflowId: string,
): ErasedWorkflowDefinition {
  const workflow = context.workflows.get(workflowId);
  if (!workflow) {
    throw new LeafPressError("WORKFLOW_UNKNOWN", `未知工作流「${workflowId}」`);
  }
  return workflow;
}

export function renewOrThrow(context: ExecutionContext, runId: string): void {
  const now = nowDate(context);
  const renewed = context.deps.store.renewLease(
    runId,
    context.owner,
    leaseExpiry(context, now),
  );
  if (!renewed) {
    throw new LeafPressError(
      "RUN_STATE_CONFLICT",
      "执行权已被别的进程接管，本进程停止",
    );
  }
}

export function reportFor(
  context: EngineContext,
  run: RunRecord,
  records = context.deps.store.getSteps(run.id),
): RunReport {
  const result: {
    runId: string;
    workflowId: string;
    state: RunRecord["state"];
    currentStep?: RunReport["currentStep"];
    wait?: RunReport["wait"];
    error?: string;
  } = { runId: run.id, workflowId: run.workflowId, state: run.state };

  if (run.state === "waiting" || run.state === "failed") {
    const record = records.find((step) => step.index === run.cursor);
    const definition = context.workflows.get(run.workflowId)?.steps[run.cursor];
    if (record && definition && record.stepId === definition.id) {
      result.currentStep = {
        id: definition.id,
        title: definition.title,
        kind: definition.kind,
      };
    }
    if (run.state === "waiting" && record?.wait) result.wait = record.wait;
    if (run.state === "failed") {
      const error = run.error ?? record?.error;
      if (error !== undefined) result.error = error;
    }
  }
  return result;
}

export function clearStepRecord(
  context: EngineContext,
  runId: string,
  stepId: string,
): void {
  context.deps.store.updateStep(runId, stepId, {
    status: "pending",
    outputs: null,
    wait: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    inputHashes: {},
  });
}
