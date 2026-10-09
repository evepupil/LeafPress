import { describe, expect, it } from "vitest";

import { pickWorkflow, WORKFLOWS } from "@leafpress/core";
import type { PlatformId, WorkflowDef } from "@leafpress/core";

import {
  createPlatformRuntime,
  missingHandlers,
} from "../../src/platforms/registry.js";

describe("平台适配登记表", () => {
  it("已登记工作流的代码步骤都有实现", () => {
    expect(missingHandlers(createPlatformRuntime(), WORKFLOWS)).toEqual([]);
  });

  it("博客账号配的是博客写稿工作流，它的三个代码步骤都登记了", () => {
    const workflow = pickWorkflow("blog", { kind: "none" });
    expect(workflow.id).toBe("blog-write");

    const runtime = createPlatformRuntime();
    const codeSteps = workflow.steps.filter((step) => step.kind === "code");
    expect(codeSteps.map((step) => step.id)).toEqual([
      "gate",
      "publish",
      "archive",
    ]);
    for (const step of codeSteps) {
      expect(runtime.codeStep(workflow.id, step.id)).toBeTypeOf("function");
    }
  });

  it("报告自造定义中缺少实现的代码步骤", () => {
    const workflow: WorkflowDef = {
      id: "custom-workflow",
      name: "自造工作流",
      platform: "any",
      from: "any",
      summary: "测试缺失处理器",
      steps: [{ id: "unimplemented", name: "未实现", kind: "code" }],
      say: "",
      requires: [],
    };

    expect(missingHandlers(createPlatformRuntime(), [workflow])).toEqual([
      "custom-workflow/unimplemented",
    ]);
  });

  it("博客有拿数据的工具和导入工具，别的平台还没有", () => {
    const runtime = createPlatformRuntime();
    const others: PlatformId[] = ["zhihu", "bilibili", "xiaohongshu"];

    expect(runtime.dataTool("blog")).toBeDefined();
    expect(runtime.importer("blog")).toBeDefined();
    expect(others.map((platform) => runtime.dataTool(platform))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(others.map((platform) => runtime.importer(platform))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
