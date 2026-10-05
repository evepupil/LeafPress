import { join } from "node:path";

import { LeafPressError, isLeafPressError } from "../shared/errors.js";
import type {
  RunReport,
  RunRecord,
  StepContext,
  StepOutcome,
  StepRecord,
  WorkflowParams,
} from "./types.js";
import type { EngineContext, ExecutionContext } from "./engine-shared.js";
import {
  getRunOrThrow,
  getWorkflowOrThrow,
  nowDate,
  reportFor,
  renewOrThrow,
} from "./engine-shared.js";
import { clearStepRecord } from "./engine-shared.js";
import {
  hashInputFiles,
  inputHashesMatch,
  prepareStepDirectory,
} from "./engine-files.js";
import type { ErasedWorkflowDefinition } from "./engine.js";

export async function progressRun(
  context: ExecutionContext,
  runId: string,
  workflow: ErasedWorkflowDefinition,
  params: WorkflowParams,
  resumeAt?: number,
  resumeInput?: StepContext["resume"],
): Promise<RunReport> {
  let rewindCount = 0;
  let resumeCursor = resumeAt;

  while (true) {
    const run = getRunOrThrow(context, runId);
    if (run.cursor >= workflow.steps.length) {
      const released = context.deps.store.releaseRun(
        runId,
        context.owner,
        "completed",
        { error: null },
      );
      if (!released) leaseConflict();
      return reportFor(context, getRunOrThrow(context, runId));
    }

    renewOrThrow(context, runId);
    const cursor = run.cursor;
    const step = workflow.steps[cursor];
    const records = context.deps.store.getSteps(runId);
    const record = records.find((value) => value.index === cursor);
    if (!step || !record || record.stepId !== step.id) {
      throw new LeafPressError(
        "RUN_STATE_CONFLICT",
        "工作流步骤记录不完整，这次运行无法继续",
      );
    }

    const isResume = resumeCursor === cursor;
    const attemptRecord = { ...record, attempts: record.attempts + 1 };
    let lostDuringHeartbeat = false;
    let stepContext: StepContext;
    let inputHashes: Record<string, string>;
    try {
      const runDir = join(context.deps.runsDir, runId);
      const stepDir = await prepareStepDirectory(
        runDir,
        step.id,
        record.attempts,
        !isResume,
      );
      const outputs = outputsFrom(records);
      stepContext = {
        runId,
        runDir,
        stepDir,
        params,
        outputs,
        ...(isResume ? { resume: resumeInput ?? {} } : {}),
        now: () => nowDate(context),
        heartbeat() {
          try {
            renewOrThrow(context, runId);
          } catch (error) {
            lostDuringHeartbeat = true;
            throw error;
          }
        },
      };
      inputHashes = isResume
        ? { ...record.inputHashes }
        : await hashInputFiles(step.inputFiles(stepContext));
    } catch (error) {
      if (isRunStateConflict(error)) throw error;
      renewOrThrow(context, runId);
      return failStep(context, run, attemptRecord, stepErrorMessage(error));
    }

    // 目录准备和文件哈希都可能等待；写 running 记录前再确认租约仍归本进程。
    renewOrThrow(context, runId);
    const startedAt = nowDate(context).toISOString();
    context.deps.store.updateStep(runId, step.id, {
      status: "running",
      attempts: attemptRecord.attempts,
      startedAt,
      finishedAt: null,
      inputHashes,
      outputs: null,
      error: null,
      wait: null,
    });
    resumeCursor = undefined;

    let outcome: StepOutcome | undefined;
    let failure: string | undefined;
    try {
      outcome = await step.run(stepContext);
    } catch (error) {
      if (lostDuringHeartbeat) throw error;
      failure = stepErrorMessage(error);
    }

    renewOrThrow(context, runId);
    if (failure !== undefined) {
      return failStep(context, run, attemptRecord, failure);
    }
    if (!outcome) {
      return failStep(context, run, attemptRecord, "步骤没有返回有效结果");
    }

    switch (outcome.type) {
      case "done": {
        let unchanged: boolean;
        try {
          unchanged = await inputHashesMatch(inputHashes);
        } catch (error) {
          if (isRunStateConflict(error)) throw error;
          renewOrThrow(context, runId);
          return failStep(context, run, attemptRecord, stepErrorMessage(error));
        }
        renewOrThrow(context, runId);
        if (!unchanged) {
          rewindCount += 1;
          if (rewindCount > (context.deps.maxRewinds ?? 20)) {
            return failStep(
              context,
              run,
              attemptRecord,
              "回退次数过多，可能陷入循环",
            );
          }
          resetRange(
            context,
            runId,
            workflow,
            cursor,
            workflow.steps.length - 1,
          );
          context.deps.store.updateRun(runId, { cursor });
          continue;
        }

        context.deps.store.completeStep(
          runId,
          step.id,
          {
            status: "done",
            outputs: outcome.outputs ?? {},
            inputHashes,
            wait: null,
            error: null,
            finishedAt: nowDate(context).toISOString(),
          },
          cursor + 1,
        );
        break;
      }
      case "wait": {
        context.deps.store.updateStep(runId, step.id, {
          status: "waiting",
          wait: outcome.wait,
          error: null,
          finishedAt: null,
        });
        const released = context.deps.store.releaseRun(
          runId,
          context.owner,
          "waiting",
          { cursor, error: null },
        );
        if (!released) leaseConflict();
        return reportFor(context, getRunOrThrow(context, runId));
      }
      case "fail":
        return failStep(context, run, attemptRecord, outcome.error);
      case "rewind": {
        const target = workflow.steps.findIndex(
          (candidate) => candidate.id === outcome.toStepId,
        );
        if (target < 0 || target > cursor) {
          return failStep(context, run, attemptRecord, "回退目标无效");
        }
        rewindCount += 1;
        if (rewindCount > (context.deps.maxRewinds ?? 20)) {
          return failStep(
            context,
            run,
            attemptRecord,
            "回退次数过多，可能陷入循环",
          );
        }
        resetRange(context, runId, workflow, target, workflow.steps.length - 1);
        context.deps.store.updateRun(runId, { cursor: target });
        break;
      }
      default: {
        const exhaustive: never = outcome;
        return failStep(context, run, attemptRecord, String(exhaustive));
      }
    }
  }
}

function outputsFrom(
  records: readonly StepRecord[],
): Record<string, Readonly<Record<string, unknown>>> {
  const outputs: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const record of records) {
    if (record.status === "done") outputs[record.stepId] = record.outputs ?? {};
  }
  return outputs;
}

function resetRange(
  context: EngineContext,
  runId: string,
  workflow: ErasedWorkflowDefinition,
  from: number,
  through: number,
): void {
  for (let index = from; index <= through; index += 1) {
    const step = workflow.steps[index];
    if (step) clearStepRecord(context, runId, step.id);
  }
}

export function failStep(
  context: ExecutionContext,
  run: RunRecord,
  record: StepRecord,
  error: string,
): RunReport {
  context.deps.store.updateStep(run.id, record.stepId, {
    status: "failed",
    attempts: record.attempts,
    outputs: null,
    error,
    wait: null,
    finishedAt: nowDate(context).toISOString(),
  });
  const workflow = getWorkflowOrThrow(context, run.workflowId);
  resetRange(
    context,
    run.id,
    workflow,
    record.index + 1,
    workflow.steps.length - 1,
  );
  const released = context.deps.store.releaseRun(
    run.id,
    context.owner,
    "failed",
    { cursor: record.index, error },
  );
  if (!released) leaseConflict();
  return reportFor(context, getRunOrThrow(context, run.id));
}

function isRunStateConflict(error: unknown): boolean {
  return isLeafPressError(error) && error.code === "RUN_STATE_CONFLICT";
}

export function stepErrorMessage(error: unknown): string {
  if (isLeafPressError(error)) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  return `内部错误：${message}`;
}

function leaseConflict(): never {
  throw new LeafPressError(
    "RUN_STATE_CONFLICT",
    "执行权已被别的进程接管，本进程停止",
  );
}
