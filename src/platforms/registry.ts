import type { PlatformId, WorkflowDef } from "@leafpress/core";

import { GENERAL_HANDLERS } from "./general/index.js";
import type { DataTool, PlatformRuntime, CodeStepHandler } from "./types.js";

/** 登记 M1 的全部实现：通用写稿的代码步骤；还没有拿数据的工具 */
export function createPlatformRuntime(): PlatformRuntime {
  const codeSteps = new Map<string, CodeStepHandler>(
    Object.entries(GENERAL_HANDLERS),
  );
  const dataTools: Partial<Record<PlatformId, DataTool>> = {};

  return {
    codeStep(workflowId, stepId) {
      return codeSteps.get(`${workflowId}/${stepId}`);
    },
    dataTool(platform) {
      return dataTools[platform];
    },
  };
}

/** 定义里有、实现里没有的代码步骤，返回「<工作流编号>/<步骤编号>」列表 */
export function missingHandlers(
  runtime: PlatformRuntime,
  workflows: readonly WorkflowDef[],
): string[] {
  const missing: string[] = [];
  for (const workflow of workflows) {
    for (const step of workflow.steps) {
      if (step.kind === "code" && !runtime.codeStep(workflow.id, step.id)) {
        missing.push(`${workflow.id}/${step.id}`);
      }
    }
  }
  return missing;
}
