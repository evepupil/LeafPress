import { describe, expect, it } from "vitest"

import type { Account, PlatformInfo, Work, WorkflowDef } from "../types/index.ts"
import { taskContext, taskState } from "./context.ts"

const at = "2026-10-08T09:30:00+08:00"
const workflow: WorkflowDef = {
  id: "context-flow",
  name: "上下文工作流",
  platform: "any",
  from: "any",
  summary: "test",
  say: "test",
  requires: [],
  steps: [
    {
      id: "write",
      name: "写稿",
      kind: "ai",
      instructions: "给{platform}的{account}写到{folder}/稿子.md",
      produces: ["稿子.md", "提纲.md"],
    },
    { id: "publish", name: "你去发布", kind: "manual", ask: "发布后回来填链接" },
    { id: "archive", name: "归档", kind: "code" },
  ],
}
const account: Account = {
  id: "zhihu-1",
  platform: "zhihu",
  name: "一叶",
  stage: "active",
  since: "2026-01-01",
  profile: "  写给开发者。  ",
  profilePath: "C:/profiles/zhihu-1.md",
  settings: [],
  createdAt: at,
  updatedAt: at,
}
const platform: PlatformInfo = {
  id: "zhihu",
  name: "知乎",
  glyph: "知",
  color: "blue",
  idPrefix: "z",
  audienceLabel: "关注者",
  metrics: [],
  setupItems: [],
}
function makeWork(overrides: Partial<Work> = {}): Work {
  return {
    id: "z-1",
    title: "上下文测试",
    accountId: account.id,
    status: "doing",
    brief: "按要求写作",
    source: { kind: "none" },
    workflowId: workflow.id,
    step: 0,
    feedbackHistory: [],
    order: 1,
    createdAt: at,
    updatedAt: at,
    tags: [],
    log: [],
    ...overrides,
  }
}

const input = (work: Work) => ({ work, account, platform, workflow, folder: "C:/tasks/z-1" })

describe("任务说明和任务状态", () => {
  it("按格式输出来源的 URL、本地位置和任务目录，以及进行中的 instructions/produces", () => {
    const text = taskContext({
      ...input(makeWork()),
      source: { title: "参考文章", url: "https://example.com/a", localPath: "C:/source/a.md", folder: "C:/tasks/source" },
    })
    const lines = text.split("\n")
    expect(lines.slice(0, 8)).toEqual([
      "# 作品 z-1：上下文测试",
      "",
      "- 平台：知乎 · 一叶",
      "- 状态：进行中（第 1/3 步 · 写稿）",
      "- 工作流：上下文工作流",
      "- 任务文件夹：C:/tasks/z-1",
      "- 来源：《参考文章》（https://example.com/a，本地 C:/source/a.md，任务文件夹 C:/tasks/source）",
      "",
    ])
    expect(lines).toContain("[>] 1. 写稿（AI）")
    expect(lines).toContain("[ ] 2. 你去发布（你来）")
    expect(lines).toContain("给知乎的一叶写到C:/tasks/z-1/稿子.md")
    expect(lines).toContain("做完把 稿子.md, 提纲.md 放进任务文件夹，然后运行 leafpress work step z-1")
    expect(lines).toContain("## 账号档案（C:/profiles/zhihu-1.md）")
    expect(lines.at(-1)).toBe("写给开发者。")
    expect(lines).not.toContain("## 出错了")
    expect(lines).not.toContain("## 等作者做的事")
    expect(lines).not.toContain("## 作者的反馈")
    expect(lines).not.toContain("## 反馈记录")
    expect(lines).not.toContain("## 任务文件夹里的文件")
  })

  it("来源括号无内容时省略，出错、ask、反馈、两条反馈历史、文件和 profile 空态逐段呈现", () => {
    const work = makeWork({
      status: "waiting",
      step: 1,
      brief: "",
      question: "要回答的问题",
      url: "https://example.com/post",
      ask: "回来填发布链接",
      feedback: "第二轮反馈",
      error: "前一步错误",
      feedbackHistory: [
        { at, step: 1, stepName: "你去发布", text: "第一条反馈" },
        { at: "2026-10-09T10:05:00+08:00", step: 1, stepName: "你去发布", text: "第二条反馈" },
      ],
    })
    const text = taskContext({ ...input(work), source: { title: "无附加位置" }, files: ["稿子.md", "图片/a.png"] })
    const lines = text.split("\n")
    expect(lines).toContain("- 来源：《无附加位置》")
    expect(lines).not.toContain("- 来源：《无附加位置》（）")
    expect(lines).toContain("- 挂的问题：要回答的问题")
    expect(lines).toContain("- 链接：https://example.com/post")
    expect(lines).toContain("（没有写）")
    expect(lines).toContain("## 出错了")
    expect(lines).toContain("## 等作者做的事")
    expect(lines).toContain("## 作者的反馈")
    expect(lines).toContain("## 反馈记录")
    expect(lines).toContain("- 10月8日 09:30（你去发布）：第一条反馈")
    expect(lines).toContain("- 10月9日 10:05（你去发布）：第二条反馈")
    expect(lines).toContain("## 任务文件夹里的文件")
    expect(lines).toContain("- 图片/a.png")

    const oneHistory = taskContext({ ...input(makeWork({ feedbackHistory: [work.feedbackHistory[0]!] })), source: undefined, files: [] })
    expect(oneHistory).not.toContain("## 反馈记录")
    expect(oneHistory).not.toContain("## 任务文件夹里的文件")
    const emptyProfile = taskContext({ ...input(makeWork()), account: { ...account, profile: "  \n  " } })
    expect(emptyProfile.split("\n").at(-1)).toBe("（还没写，写之前先问作者这个号写给谁、怎么写）")
  })

  it("二级标题后留空行，反馈记录、文件和档案段落顺序稳定", () => {
    const work = makeWork({
      error: "步骤错误",
      ask: "请检查",
      feedback: "已修改",
      feedbackHistory: [
        { at, step: 0, stepName: "写稿", text: "第一条" },
        { at: "2026-10-09T09:30:00+08:00", step: 0, stepName: "写稿", text: "第二条" },
      ],
    })
    const lines = taskContext({ ...input(work), files: ["稿子.md"] }).split("\n")
    const headings = [
      "## 要求",
      "## 步骤",
      "## 这一步怎么做",
      "## 出错了",
      "## 等作者做的事",
      "## 作者的反馈",
      "## 反馈记录",
      "## 任务文件夹里的文件",
      "## 账号档案（C:/profiles/zhihu-1.md）",
    ]
    const positions = headings.map((heading) => lines.indexOf(heading))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    for (const position of positions) expect(lines[position + 1]).toBe("")
  })

  it("代码运行说明和 TaskState 字段精确", () => {
    const work = makeWork({ step: 2, status: "doing", feedback: "保留的反馈", lease: { since: at, expiresAt: at }, error: "之前错误" })
    const context = taskContext(input(work))
    expect(context).toContain("## 这一步怎么做\n\n运行 leafpress work run z-1")
    expect(taskState(work, workflow, platform)).toEqual({
      id: "z-1",
      title: "上下文测试",
      accountId: "zhihu-1",
      platform: "zhihu",
      status: "doing",
      statusText: "进行中",
      step: 2,
      stepCount: 3,
      currentStep: { id: "archive", name: "归档", kind: "code" },
      workflowId: "context-flow",
      feedback: "保留的反馈",
      lease: { since: at, expiresAt: at },
      error: "之前错误",
      updatedAt: at,
    })
    const done = taskState(makeWork({ status: "done", step: 3 }), workflow, platform)
    expect(done.currentStep).toBeUndefined()
    expect(done.statusText).toBe("已完成")
  })
})
