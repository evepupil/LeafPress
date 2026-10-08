import type { WorkflowDef } from "../types/index.ts"

/**
 * 发布工作流的定义：一个作品从开始到发布要走的步骤。这里是定义的唯一来源。
 * 代码步骤的实现在 src/platforms/<平台>/（通用工作流在 src/platforms/general/），按「工作流编号 + 步骤编号」登记。
 * 接一个平台时在这里加它专用的工作流（放在通用写稿前面）；自动配按平台和 from 挑，不用另写规则。
 */

/** 通用写稿：任何平台都能用；平台还没有专用工作流时自动配它 */
export const GENERAL_WRITE: WorkflowDef = {
  id: "general-write",
  name: "通用写稿",
  platform: "any",
  from: "any",
  summary: "AI 按要求和账号档案写稿，你去平台发布，回来贴上链接。",
  steps: [
    {
      id: "draft",
      name: "写稿",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["稿子.md"],
      instructions:
        "先整份读账号档案和要求；有来源的先读来源。按{platform}的写法写成 Markdown，存到 {folder}/稿子.md。" +
        "作者的反馈里要改的地方，照着改完再交。",
    },
    {
      id: "publish",
      name: "你去发布",
      kind: "manual",
      ask: "打开 {folder}/稿子.md 看一遍，没问题就发到{platform}（{account}），发完把链接填在下面；要改就写要改哪里。",
    },
    { id: "archive", name: "归档链接", kind: "code", tool: "记录库" },
  ],
  say: "按通用写稿做一下这个作品",
  requires: [],
}

/** 全部发布工作流：平台专用的在前，通用的在最后 */
export const WORKFLOWS: WorkflowDef[] = [GENERAL_WRITE]
