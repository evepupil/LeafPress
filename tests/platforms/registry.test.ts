import { describe, expect, it } from "vitest";

import { WORKFLOWS } from "@leafpress/core";
import type { PlatformId, WorkflowDef } from "@leafpress/core";

import {
  createPlatformRuntime,
  missingHandlers,
} from "../../src/platforms/registry.js";

describe("平台适配登记表", () => {
  it("已登记工作流的代码步骤都有实现", () => {
    expect(missingHandlers(createPlatformRuntime(), WORKFLOWS)).toEqual([]);
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

  it("M1 的四个平台都还没有数据工具", () => {
    const runtime = createPlatformRuntime();
    const platforms: PlatformId[] = [
      "blog",
      "zhihu",
      "bilibili",
      "xiaohongshu",
    ];

    expect(platforms.map((platform) => runtime.dataTool(platform))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
