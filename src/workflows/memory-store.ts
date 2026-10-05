import { LeafPressError } from "../shared/errors.js";
import type {
  AcquireRunOptions,
  RunPatch,
  RunRecord,
  RunStore,
  StepPatch,
  StepRecord,
} from "./types.js";

export interface MemoryRunStoreOptions {
  readonly now?: () => Date;
}

export function createMemoryRunStore(
  options: MemoryRunStoreOptions = {},
): RunStore {
  const now = options.now ?? (() => new Date());
  const runs = new Map<string, RunRecord>();
  const steps = new Map<string, Map<string, StepRecord>>();

  function timestamp(): string {
    return now().toISOString();
  }

  function updateRunRecord(
    run: RunRecord,
    patch: Omit<RunPatch, "state">,
  ): RunRecord {
    const next: Record<string, unknown> = { ...run, ...patch };
    if (patch.error === null) delete next.error;
    next.updatedAt = timestamp();
    return next as unknown as RunRecord;
  }

  function updateStepRecord(step: StepRecord, patch: StepPatch): StepRecord {
    const next: Record<string, unknown> = { ...step, ...patch };
    for (const key of [
      "outputs",
      "wait",
      "error",
      "startedAt",
      "finishedAt",
    ] as const) {
      if (patch[key] === null) delete next[key];
    }
    return structuredClone(next as unknown as StepRecord);
  }

  function findRun(runId: string): RunRecord | undefined {
    return runs.get(runId);
  }

  function findRunOrThrow(runId: string): RunRecord {
    const run = findRun(runId);
    if (!run) {
      throw new LeafPressError("RUN_NOT_FOUND", `找不到运行「${runId}」`);
    }
    return run;
  }

  function findSteps(runId: string): Map<string, StepRecord> {
    const value = steps.get(runId);
    if (!value) {
      throw new LeafPressError("INTERNAL", `运行「${runId}」没有步骤记录`);
    }
    return value;
  }

  function findStep(runId: string, stepId: string): StepRecord {
    const value = findSteps(runId).get(stepId);
    if (!value) {
      throw new LeafPressError(
        "INTERNAL",
        `运行「${runId}」中没有步骤「${stepId}」`,
      );
    }
    return value;
  }

  function saveRun(run: RunRecord): void {
    runs.set(run.id, structuredClone(run));
  }

  function toIso(value: string): number {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  }

  const store: RunStore = {
    createRun(run, runSteps) {
      if (runs.has(run.id)) {
        throw new LeafPressError("INTERNAL", `运行编号「${run.id}」已存在`);
      }
      const stepMap = new Map<string, StepRecord>();
      for (const step of runSteps) {
        if (stepMap.has(step.stepId)) {
          throw new LeafPressError(
            "INTERNAL",
            `运行「${run.id}」的步骤编号「${step.stepId}」重复`,
          );
        }
        stepMap.set(step.stepId, structuredClone(step));
      }
      saveRun(structuredClone(run));
      steps.set(run.id, stepMap);
    },

    getRun(runId) {
      const value = findRun(runId);
      return value ? structuredClone(value) : undefined;
    },

    listRuns(filter) {
      const states = filter?.states;
      return [...runs.values()]
        .filter((run) => !states || states.includes(run.state))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((run) => structuredClone(run));
    },

    acquireRun(runId, acquire: AcquireRunOptions) {
      const run = findRun(runId);
      if (!run) return false;
      const allowedState = acquire.from.includes(run.state);
      const expiredTakeover =
        acquire.takeOverExpired &&
        run.state === "running" &&
        run.leaseExpiresAt !== undefined &&
        toIso(run.leaseExpiresAt) < toIso(acquire.now);
      if (!allowedState && !expiredTakeover) return false;

      const patch: Record<string, unknown> = {
        ...run,
        ...acquire.patch,
        state: "running",
        leaseOwner: acquire.owner,
        leaseExpiresAt: acquire.leaseExpiresAt,
        updatedAt: timestamp(),
      };
      if (acquire.patch?.error === null) delete patch.error;
      saveRun(patch as unknown as RunRecord);
      return true;
    },

    renewLease(runId, owner, leaseExpiresAt) {
      const run = findRun(runId);
      if (!run || run.state !== "running" || run.leaseOwner !== owner) {
        return false;
      }
      saveRun({ ...run, leaseExpiresAt, updatedAt: timestamp() });
      return true;
    },

    releaseRun(runId, owner, to, patch = {}) {
      const run = findRun(runId);
      if (!run || run.state !== "running" || run.leaseOwner !== owner) {
        return false;
      }
      const next: Record<string, unknown> = {
        ...run,
        ...patch,
        state: to,
        updatedAt: timestamp(),
      };
      delete next.leaseOwner;
      delete next.leaseExpiresAt;
      if (patch.error === null) delete next.error;
      saveRun(next as unknown as RunRecord);
      return true;
    },

    transitionRun(runId, from, to, patch = {}) {
      const run = findRun(runId);
      if (!run || !from.includes(run.state)) return false;
      const next: Record<string, unknown> = {
        ...run,
        ...patch,
        state: to,
        updatedAt: timestamp(),
      };
      if (to !== "running") {
        delete next.leaseOwner;
        delete next.leaseExpiresAt;
      }
      if (patch.error === null) delete next.error;
      saveRun(next as unknown as RunRecord);
      return true;
    },

    updateRun(runId, patch) {
      const run = findRunOrThrow(runId);
      const next: Record<string, unknown> = { ...run, ...patch };
      if (patch.error === null) delete next.error;
      next.updatedAt = timestamp();
      saveRun(next as unknown as RunRecord);
    },

    getSteps(runId) {
      const value = steps.get(runId);
      if (!value) return [];
      return [...value.values()]
        .sort((a, b) => a.index - b.index)
        .map((step) => structuredClone(step));
    },

    updateStep(runId, stepId, patch) {
      const run = findRunOrThrow(runId);
      const step = findStep(runId, stepId);
      findSteps(runId).set(stepId, updateStepRecord(step, patch));
      saveRun(updateRunRecord(run, {}));
    },

    completeStep(runId, stepId, patch, nextCursor) {
      const run = findRunOrThrow(runId);
      const step = findStep(runId, stepId);
      const nextStep = updateStepRecord(step, patch);
      const nextRun: RunRecord = {
        ...run,
        cursor: nextCursor,
        updatedAt: timestamp(),
      };
      findSteps(runId).set(stepId, nextStep);
      saveRun(nextRun);
    },
  };

  return store;
}
