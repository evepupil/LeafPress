import type { RunRecord, RunStore } from "../workflows/types.js";
import type { RunPatch, StepPatch } from "../workflows/types.js";
import {
  encodeJson,
  storeFailed,
  storeOperation,
  type StoreContext,
} from "./sql.js";
import { mapRun, mapStep } from "./run-mapping.js";
import { addRunValue, appendRunPatch, isOneChange } from "./run-sql-helpers.js";

export function createRunsStore(context: StoreContext): RunStore {
  const { db, now } = context;

  function getRun(runId: string): RunRecord | undefined {
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
    return row === undefined ? undefined : mapRun(row);
  }

  function updateRun(runId: string, patch: RunPatch): void {
    const assignments: string[] = [];
    const values: (string | number | null)[] = [];
    if (patch.state !== undefined) {
      assignments.push("state = ?");
      values.push(patch.state);
    }
    if (patch.cursor !== undefined) {
      assignments.push("cursor = ?");
      values.push(patch.cursor);
    }
    if (patch.error !== undefined) {
      assignments.push("error = ?");
      values.push(patch.error);
    }
    assignments.push("updated_at = ?");
    values.push(now().toISOString(), runId);
    const result = db
      .prepare(`UPDATE runs SET ${assignments.join(", ")} WHERE id = ?`)
      .run(...values);
    if (!isOneChange(result.changes))
      throw storeFailed(`运行「${runId}」不存在。`);
  }

  function updateStep(runId: string, stepId: string, patch: StepPatch): void {
    const assignments: string[] = [];
    const values: (string | number | null)[] = [];
    if (patch.status !== undefined)
      addRunValue(assignments, values, "status", patch.status);
    if (patch.inputHashes !== undefined) {
      addRunValue(
        assignments,
        values,
        "input_hashes",
        encodeJson(patch.inputHashes, "run_steps", "input_hashes"),
      );
    }
    if (patch.outputs !== undefined) {
      addRunValue(
        assignments,
        values,
        "outputs",
        patch.outputs === null
          ? null
          : encodeJson(patch.outputs, "run_steps", "outputs"),
      );
    }
    if (patch.wait !== undefined) {
      addRunValue(
        assignments,
        values,
        "wait",
        patch.wait === null
          ? null
          : encodeJson(patch.wait, "run_steps", "wait"),
      );
    }
    if (patch.error !== undefined)
      addRunValue(assignments, values, "error", patch.error);
    if (patch.attempts !== undefined)
      addRunValue(assignments, values, "attempts", patch.attempts);
    if (patch.startedAt !== undefined)
      addRunValue(assignments, values, "started_at", patch.startedAt);
    if (patch.finishedAt !== undefined)
      addRunValue(assignments, values, "finished_at", patch.finishedAt);
    if (assignments.length === 0) return;
    values.push(runId, stepId);
    const result = db
      .prepare(
        `UPDATE run_steps SET ${assignments.join(", ")} WHERE run_id = ? AND step_id = ?`,
      )
      .run(...values);
    if (!isOneChange(result.changes)) {
      throw storeFailed(`运行「${runId}」中的步骤「${stepId}」不存在。`);
    }
  }

  return {
    createRun(run, steps) {
      storeOperation("创建工作流运行失败。", () =>
        context.withTransaction(() => {
          db.prepare(
            `INSERT INTO runs (
              id, workflow_id, params, state, cursor, error, lease_owner,
              lease_expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            run.id,
            run.workflowId,
            encodeJson(run.params, "runs", "params"),
            run.state,
            run.cursor,
            run.error ?? null,
            run.leaseOwner ?? null,
            run.leaseExpiresAt ?? null,
            run.createdAt,
            run.updatedAt,
          );
          const insertStep = db.prepare(
            `INSERT INTO run_steps (
              run_id, step_id, idx, status, input_hashes, outputs, wait, error,
              attempts, started_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const step of steps) {
            insertStep.run(
              step.runId,
              step.stepId,
              step.index,
              step.status,
              encodeJson(step.inputHashes, "run_steps", "input_hashes"),
              step.outputs === undefined
                ? null
                : encodeJson(step.outputs, "run_steps", "outputs"),
              step.wait === undefined
                ? null
                : encodeJson(step.wait, "run_steps", "wait"),
              step.error ?? null,
              step.attempts,
              step.startedAt ?? null,
              step.finishedAt ?? null,
            );
          }
        }),
      );
    },

    getRun(runId) {
      return storeOperation("读取工作流运行失败。", () => getRun(runId));
    },

    listRuns(filter) {
      return storeOperation("列出工作流运行失败。", () => {
        if (filter?.states !== undefined && filter.states.length === 0)
          return [];
        if (filter?.states === undefined) {
          return db
            .prepare("SELECT * FROM runs ORDER BY created_at DESC, id DESC")
            .all()
            .map(mapRun);
        }
        const placeholders = filter.states.map(() => "?").join(", ");
        return db
          .prepare(
            `SELECT * FROM runs WHERE state IN (${placeholders})
             ORDER BY created_at DESC, id DESC`,
          )
          .all(...filter.states)
          .map(mapRun);
      });
    },

    acquireRun(runId, options) {
      return storeOperation("取得工作流运行租约失败。", () => {
        const assignments = [
          "state = 'running'",
          "lease_owner = ?",
          "lease_expires_at = ?",
          "updated_at = ?",
        ];
        const values: (string | number | null)[] = [
          options.owner,
          options.leaseExpiresAt,
          now().toISOString(),
        ];
        appendRunPatch(assignments, values, options.patch);
        const fromCondition = options.from.length
          ? `state IN (${options.from.map(() => "?").join(", ")})`
          : "0";
        const expiredCondition = options.takeOverExpired
          ? "(state = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)"
          : "0";
        const whereValues: (string | number | null)[] = [
          runId,
          ...options.from,
        ];
        if (options.takeOverExpired) whereValues.push(options.now);
        const result = db
          .prepare(
            `UPDATE runs SET ${assignments.join(", ")}
             WHERE id = ? AND (${fromCondition} OR ${expiredCondition})`,
          )
          .run(...values, ...whereValues);
        return isOneChange(result.changes);
      });
    },

    renewLease(runId, owner, leaseExpiresAt) {
      return storeOperation("续约工作流运行失败。", () => {
        const currentTime = now().toISOString();
        const result = db
          .prepare(
            `UPDATE runs SET lease_expires_at = ?, updated_at = ?
             WHERE id = ? AND state = 'running' AND lease_owner = ?`,
          )
          .run(leaseExpiresAt, currentTime, runId, owner);
        return isOneChange(result.changes);
      });
    },

    releaseRun(runId, owner, to, patch) {
      return storeOperation("交还工作流运行租约失败。", () => {
        const currentTime = now().toISOString();
        const assignments = [
          "state = ?",
          "lease_owner = NULL",
          "lease_expires_at = NULL",
          "updated_at = ?",
        ];
        const values: (string | number | null)[] = [to, currentTime];
        appendRunPatch(assignments, values, patch);
        const result = db
          .prepare(
            `UPDATE runs SET ${assignments.join(", ")}
             WHERE id = ? AND state = 'running' AND lease_owner = ?`,
          )
          .run(...values, runId, owner);
        return isOneChange(result.changes);
      });
    },

    transitionRun(runId, from, to, patch) {
      return storeOperation("切换工作流运行状态失败。", () => {
        const assignments = ["state = ?"];
        const values: (string | number | null)[] = [to];
        if (to !== "running") {
          assignments.push("lease_owner = NULL", "lease_expires_at = NULL");
        }
        assignments.push("updated_at = ?");
        values.push(now().toISOString());
        appendRunPatch(assignments, values, patch);
        const stateCondition = from.length
          ? `state IN (${from.map(() => "?").join(", ")})`
          : "0";
        const result = db
          .prepare(
            `UPDATE runs SET ${assignments.join(", ")} WHERE id = ? AND ${stateCondition}`,
          )
          .run(...values, runId, ...from);
        return isOneChange(result.changes);
      });
    },

    updateRun(runId, patch) {
      storeOperation("更新工作流运行失败。", () => updateRun(runId, patch));
    },

    getSteps(runId) {
      return storeOperation("读取工作流步骤失败。", () =>
        db
          .prepare("SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx ASC")
          .all(runId)
          .map(mapStep),
      );
    },

    updateStep(runId, stepId, patch) {
      storeOperation("更新工作流步骤失败。", () =>
        updateStep(runId, stepId, patch),
      );
    },

    completeStep(runId, stepId, patch, nextCursor) {
      storeOperation("完成工作流步骤失败。", () =>
        context.withTransaction(() => {
          updateStep(runId, stepId, patch);
          updateRun(runId, { cursor: nextCursor });
        }),
      );
    },
  };
}
