import type { RunRecord, RunState, StepRecord } from "../workflows/types.js";
import {
  decodeJson,
  optionalString,
  requiredNumber,
  requiredString,
  storeFailed,
  type SqlRow,
} from "./sql.js";

export function mapRun(row: SqlRow): RunRecord {
  const params = decodeJson<RunRecord["params"]>(row.params, "runs", "params");
  if (params === undefined)
    throw storeFailed("记录库表「runs」的「params」不能为空。");
  const error = optionalString(row, "error", "runs");
  const leaseOwner = optionalString(row, "lease_owner", "runs");
  const leaseExpiresAt = optionalString(row, "lease_expires_at", "runs");
  return {
    id: requiredString(row, "id", "runs"),
    workflowId: requiredString(row, "workflow_id", "runs"),
    params,
    state: requiredString(row, "state", "runs") as RunState,
    cursor: requiredNumber(row, "cursor", "runs"),
    ...(error === undefined ? {} : { error }),
    ...(leaseOwner === undefined ? {} : { leaseOwner }),
    ...(leaseExpiresAt === undefined ? {} : { leaseExpiresAt }),
    createdAt: requiredString(row, "created_at", "runs"),
    updatedAt: requiredString(row, "updated_at", "runs"),
  };
}

export function mapStep(row: SqlRow): StepRecord {
  const inputHashes = decodeJson<StepRecord["inputHashes"]>(
    row.input_hashes,
    "run_steps",
    "input_hashes",
  );
  if (inputHashes === undefined) {
    throw storeFailed("记录库表「run_steps」的「input_hashes」不能为空。");
  }
  const outputs = decodeJson<StepRecord["outputs"]>(
    row.outputs,
    "run_steps",
    "outputs",
  );
  const wait = decodeJson<StepRecord["wait"]>(row.wait, "run_steps", "wait");
  const error = optionalString(row, "error", "run_steps");
  const startedAt = optionalString(row, "started_at", "run_steps");
  const finishedAt = optionalString(row, "finished_at", "run_steps");
  return {
    runId: requiredString(row, "run_id", "run_steps"),
    stepId: requiredString(row, "step_id", "run_steps"),
    index: requiredNumber(row, "idx", "run_steps"),
    status: requiredString(row, "status", "run_steps") as StepRecord["status"],
    inputHashes,
    ...(outputs === undefined ? {} : { outputs }),
    ...(wait === undefined ? {} : { wait }),
    ...(error === undefined ? {} : { error }),
    attempts: requiredNumber(row, "attempts", "run_steps"),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}
