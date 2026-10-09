import type { PlatformId, WorkflowDef } from "@leafpress/core";

import { createBlogImporter } from "./blog/import.js";
import { createBlogHandlers } from "./blog/steps/index.js";
import { createUmamiDataTool } from "./blog/umami/data.js";
import { GENERAL_HANDLERS } from "./general/index.js";
import type {
  CodeStepHandler,
  DataTool,
  PlatformRuntime,
  PostImporter,
} from "./types.js";

/** 建登记表时可以注入的外部依赖：测试里换成假的，不真访问网络、不真等待 */
export interface PlatformRuntimeOptions {
  /** 网络请求；缺省用步骤上下文里带的（全局 fetch） */
  fetch?: typeof fetch;
  /** 等待；缺省用步骤上下文里带的（真的等待） */
  sleep?: (ms: number) => Promise<void>;
}

/** 登记已实现的代码步骤、拿数据的工具、导入工具：通用写稿 + 博客 */
export function createPlatformRuntime(
  options: PlatformRuntimeOptions = {},
): PlatformRuntime {
  const codeSteps = new Map<string, CodeStepHandler>([
    ...Object.entries(GENERAL_HANDLERS),
    ...Object.entries(createBlogHandlers(options)),
  ]);
  const dataTools: Partial<Record<PlatformId, DataTool>> = {
    blog: createUmamiDataTool(),
  };
  const importers: Partial<Record<PlatformId, PostImporter>> = {
    blog: createBlogImporter(),
  };

  return {
    codeStep(workflowId, stepId) {
      return codeSteps.get(`${workflowId}/${stepId}`);
    },
    dataTool(platform) {
      return dataTools[platform];
    },
    importer(platform) {
      return importers[platform];
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
