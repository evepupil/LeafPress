import { describe, expect, it } from "vitest";

import { ZHIHU_STEP_HANDLERS } from "../../../src/platforms/zhihu/steps/index.js";

describe("知乎代码步骤登记", () => {
  it("三条工作流各登记 copy-page 和 archive，共 6 个，共用两个实现", () => {
    expect(Object.keys(ZHIHU_STEP_HANDLERS).sort()).toEqual([
      "zhihu-answer/archive",
      "zhihu-answer/copy-page",
      "zhihu-article/archive",
      "zhihu-article/copy-page",
      "zhihu-from-blog/archive",
      "zhihu-from-blog/copy-page",
    ]);
    const unique = new Set(Object.values(ZHIHU_STEP_HANDLERS));
    expect(unique.size).toBe(2);
  });
});
