import { LeafPressError } from "../shared/errors.js";
import type {
  ResumeInput,
  RunReport,
  RunState,
  RunStore,
  StepRecord,
  WorkflowDefinition,
} from "./types.js";
import { cancelRun } from "./engine-control.js";
import {
  createExecutionContext,
  getRunOrThrow,
  reportFor,
} from "./engine-shared.js";
import { resumeRun } from "./engine-resume.js";
import { startRun } from "./engine-start.js";

// 工作流参数类型在引擎边界擦除，具体定义仍在创建工作流时校验。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErasedWorkflowDefinition = WorkflowDefinition<any>;

export interface EngineDeps {
  readonly store: RunStore;
  readonly workflows: readonly ErasedWorkflowDefinition[];
  readonly runsDir: string;
  readonly now?: () => Date;
  readonly newRunId?: (now: Date) => string;
  readonly newOwnerToken?: () => string;
  readonly leaseMs?: number;
  readonly maxRewinds?: number;
}

export interface RunDetail extends RunReport {
  readonly steps: StepRecord[];
}

export interface WorkflowEngine {
  start(workflowId: string, rawParams: unknown): Promise<RunReport>;
  resume(
    runId: string,
    input?: ResumeInput,
    options?: { readonly force?: boolean },
  ): Promise<RunReport>;
  cancel(runId: string, options?: { readonly force?: boolean }): RunReport;
  show(runId: string): RunDetail;
  list(filter?: {
    readonly states?: readonly RunState[];
  }): ReturnType<RunStore["listRuns"]>;
}

export function createWorkflowEngine(deps: EngineDeps): WorkflowEngine {
  const workflows = new Map<string, ErasedWorkflowDefinition>();
  for (const workflow of deps.workflows) {
    if (workflows.has(workflow.id)) {
      throw new LeafPressError("INTERNAL", `工作流编号「${workflow.id}」重复`);
    }
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (!/^[a-z][a-z0-9-]*$/.test(step.id)) {
        throw new LeafPressError(
          "INTERNAL",
          `工作流「${workflow.id}」的步骤编号「${step.id}」不合规`,
        );
      }
      if (stepIds.has(step.id)) {
        throw new LeafPressError(
          "INTERNAL",
          `工作流「${workflow.id}」的步骤编号「${step.id}」重复`,
        );
      }
      stepIds.add(step.id);
    }
    workflows.set(workflow.id, workflow);
  }

  const context = {
    deps,
    workflows,
  };

  return {
    start: (workflowId, rawParams) =>
      startRun(createExecutionContext(context), workflowId, rawParams),
    resume: (runId, input, options) =>
      resumeRun(createExecutionContext(context), runId, input, options),
    cancel: (runId, options) =>
      cancelRun(createExecutionContext(context), runId, options),
    show(runId) {
      const run = getRunOrThrow(context, runId);
      const steps = deps.store.getSteps(runId);
      return { ...reportFor(context, run, steps), steps };
    },
    list: (filter) => deps.store.listRuns(filter),
  };
}
