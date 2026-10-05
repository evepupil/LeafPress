import { LeafPressError, isLeafPressError } from "../shared/errors.js";
import type { ResumeInput, RunReport } from "./types.js";
import type { ExecutionContext } from "./engine-shared.js";
import {
  getRunOrThrow,
  getWorkflowOrThrow,
  leaseExpiry,
  nowDate,
  renewOrThrow,
} from "./engine-shared.js";
import { clearStepRecord } from "./engine-shared.js";
import { inputHashesMatch } from "./engine-files.js";
import type { ErasedWorkflowDefinition } from "./engine.js";
import { failStep, progressRun, stepErrorMessage } from "./engine-progress.js";

export async function resumeRun(
  context: ExecutionContext,
  runId: string,
  input?: ResumeInput,
  options?: { readonly force?: boolean },
): Promise<RunReport> {
  const run = getRunOrThrow(context, runId);
  if (run.state === "completed" || run.state === "cancelled") {
    throw new LeafPressError("RUN_STATE_CONFLICT", "这次运行已经结束");
  }

  const workflow = getWorkflowOrThrow(context, run.workflowId);
  const records = context.deps.store.getSteps(runId);
  if (
    records.length !== workflow.steps.length ||
    workflow.steps.some(
      (step, index) =>
        records[index]?.index !== index || records[index]?.stepId !== step.id,
    )
  ) {
    throw new LeafPressError(
      "RUN_STATE_CONFLICT",
      "工作流定义已经变了，这次运行没法恢复，请取消后重新开始",
    );
  }

  // 获取执行权必须在第一个 await 前完成；并发 resume 才会由存储的 CAS 决出唯一持有者。
  const now = nowDate(context);
  const acquired = context.deps.store.acquireRun(runId, {
    from: ["waiting", "failed"],
    owner: context.owner,
    leaseExpiresAt: leaseExpiry(context, now),
    now: now.toISOString(),
    takeOverExpired: options?.force === true,
    patch: { error: null },
  });
  if (!acquired) {
    throw new LeafPressError(
      "RUN_STATE_CONFLICT",
      acquireConflictMessage(
        run.state,
        run.leaseExpiresAt,
        now,
        options?.force,
      ),
    );
  }

  return resumeAcquired(context, runId, run, workflow, records, input);
}

async function resumeAcquired(
  context: ExecutionContext,
  runId: string,
  originalRun: ReturnType<typeof getRunOrThrow>,
  workflow: ErasedWorkflowDefinition,
  records: ReturnType<typeof context.deps.store.getSteps>,
  input?: ResumeInput,
): Promise<RunReport> {
  let cursor = originalRun.cursor;
  while (cursor < workflow.steps.length && records[cursor]?.status === "done") {
    cursor += 1;
  }
  if (cursor !== originalRun.cursor) {
    context.deps.store.updateRun(runId, { cursor });
  }

  let invalidatedAt: number | undefined;
  for (let index = 0; index <= cursor; index += 1) {
    const record = records[index];
    if (!record) continue;
    const shouldCheck =
      (index < cursor && record.status === "done") ||
      (index === cursor && record.status === "waiting");
    if (shouldCheck) {
      let matches: boolean;
      try {
        matches = await inputHashesMatch(record.inputHashes);
      } catch (error) {
        if (isLeafPressError(error) && error.code === "RUN_STATE_CONFLICT") {
          throw error;
        }
        renewOrThrow(context, runId);
        return failStep(context, originalRun, record, stepErrorMessage(error));
      }
      if (!matches) {
        invalidatedAt = index;
        break;
      }
    }
  }

  let resumeAt: number | undefined;
  if (invalidatedAt !== undefined) {
    renewOrThrow(context, runId);
    for (let index = invalidatedAt; index < workflow.steps.length; index += 1) {
      const step = workflow.steps[index];
      if (step) clearStepRecord(context, runId, step.id);
    }
    context.deps.store.updateRun(runId, { cursor: invalidatedAt });
  } else if (records[cursor]?.status === "waiting") {
    resumeAt = cursor;
  }

  return progressRun(
    context,
    runId,
    workflow,
    originalRun.params,
    resumeAt,
    input,
  );
}

function acquireConflictMessage(
  state: ReturnType<typeof getRunOrThrow>["state"],
  leaseExpiresAt: string | undefined,
  now: Date,
  force: boolean | undefined,
): string {
  if (state === "running") {
    if (leaseExpiresAt && Date.parse(leaseExpiresAt) < now.getTime()) {
      return force
        ? "运行状态已经变化，请重新查看"
        : "上次似乎异常退出，确认后加 --force 接管";
    }
    return "正在别处运行";
  }
  return "状态已经变了，请重新查看";
}
