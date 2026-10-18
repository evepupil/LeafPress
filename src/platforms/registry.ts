import type { PlatformId, WorkflowDef } from "@leafpress/core";

import { createBlogImporter } from "./blog/import.js";
import { createBlogHandlers } from "./blog/steps/index.js";
import { createUmamiDataTool } from "./blog/umami/data.js";
import { GENERAL_HANDLERS } from "./general/index.js";
import { createEdgeCardRenderer } from "./xiaohongshu/cards/edge.js";
import { createXhsHandlers } from "./xiaohongshu/steps/index.js";
import { createZhihuDataTool } from "./zhihu/data.js";
import { createZhihuQuestionFinder } from "./zhihu/ideas/finder.js";
import { createZhihuImporter } from "./zhihu/import.js";
import { ZHIHU_STEP_HANDLERS } from "./zhihu/steps/index.js";
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

/** 登记已实现的代码步骤、拿数据的工具、导入工具：通用写稿 + 博客 + 知乎 + 小红书 */
export function createPlatformRuntime(
  options: PlatformRuntimeOptions = {},
): PlatformRuntime {
  const codeSteps = new Map<string, CodeStepHandler>([
    ...Object.entries(GENERAL_HANDLERS),
    ...Object.entries(createBlogHandlers(options)),
    ...Object.entries(ZHIHU_STEP_HANDLERS),
    // 小红书卡片出图用本机 Edge；起 Edge 是在步骤执行时，登记时不起
    ...Object.entries(
      createXhsHandlers({ renderer: createEdgeCardRenderer() }),
    ),
  ]);
  const dataTools: Partial<Record<PlatformId, DataTool>> = {
    blog: createUmamiDataTool(),
    zhihu: createZhihuDataTool(),
  };
  const importers: Partial<Record<PlatformId, PostImporter>> = {
    blog: createBlogImporter(),
    zhihu: createZhihuImporter(),
  };
  const questionFinders = {
    zhihu: createZhihuQuestionFinder(),
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
    questionFinder(platform) {
      return platform === "zhihu" ? questionFinders.zhihu : undefined;
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
