import { expect, test } from "vitest"

import { GENERAL_WRITE, WORKFLOWS } from "../catalog/index.ts"
import type { PlatformId, WorkflowDef, WorkSource } from "../types/index.ts"
import { fillTemplate, isUsable, pickFromList, pickWorkflow, workflowsFor, workflowById } from "./workflows.ts"
import type { StepVars } from "./workflows.ts"

const IDEA_SOURCE: WorkSource = { kind: "idea", ideaId: "i-1" }
const NEW_SOURCE: WorkSource = { kind: "none" }
const WORK_SOURCE: WorkSource = { kind: "work", workId: "b-1" }
const IMPORT_SOURCE: WorkSource = { kind: "import" }

test("pickWorkflow：M1 只有通用写稿，任何平台任何来源都返回它", () => {
  for (const platform of ["blog", "zhihu", "bilibili", "xiaohongshu"] as PlatformId[]) {
    for (const source of [IDEA_SOURCE, NEW_SOURCE, WORK_SOURCE, IMPORT_SOURCE]) {
      expect(pickWorkflow(platform, source, "blog")).toBe(GENERAL_WRITE)
    }
  }
})

test("workflowById：按编号找；没有的返回 undefined 不抛错", () => {
  expect(workflowById("general-write")).toBe(GENERAL_WRITE)
  expect(workflowById("no-such-workflow")).toBeUndefined()
})

test("workflowsFor：平台专用的在前，通用的在后；没有专用的就只有通用", () => {
  expect(workflowsFor("blog")).toEqual([GENERAL_WRITE])
  expect(workflowsFor("zhihu")).toEqual([GENERAL_WRITE])
})

/** 自造的一份列表（不含 catalog 里的定义），验证通用挑选规则 */
const TEST_LIST: WorkflowDef[] = [
  {
    id: "zhihu-answer",
    name: "知乎回答",
    platform: "zhihu",
    from: "blog-work",
    summary: "",
    steps: [],
    say: "",
    requires: [],
  },
  {
    id: "zhihu-write",
    name: "知乎写作",
    platform: "zhihu",
    from: "idea",
    summary: "",
    steps: [],
    say: "",
    requires: [],
  },
  {
    id: "xhs-cards",
    name: "转小红书卡片",
    platform: "xiaohongshu",
    from: "any",
    summary: "",
    steps: [],
    say: "",
    requires: [],
  },
  {
    id: "universal",
    name: "通用写稿",
    platform: "any",
    from: "any",
    summary: "",
    steps: [],
    say: "",
    requires: [],
  },
]

test("挑专用：按 from 挑，专用的按列表顺序优先", () => {
  // 来源是博客作品 → 博客作品专用的「知乎回答」（列表里它在知乎写作前面）
  expect(pickFromList(TEST_LIST, "zhihu", WORK_SOURCE, "blog").id).toBe("zhihu-answer")
  // 来源是灵感或直接新建 → 「知乎写作」
  expect(pickFromList(TEST_LIST, "zhihu", IDEA_SOURCE).id).toBe("zhihu-write")
  expect(pickFromList(TEST_LIST, "zhihu", NEW_SOURCE).id).toBe("zhihu-write")
  // any 的 from 对任何来源都对得上
  expect(pickFromList(TEST_LIST, "xiaohongshu", IMPORT_SOURCE).id).toBe("xhs-cards")
})

test("挑不到专用的回落通用写稿", () => {
  // 博客没有专用工作流
  expect(pickFromList(TEST_LIST, "blog", IDEA_SOURCE).id).toBe("universal")
  // 来源是作品但不是来自博客：知乎的 blog-work 对不上，idea 也对不上 → 通用
  expect(pickFromList(TEST_LIST, "zhihu", WORK_SOURCE, "zhihu").id).toBe("universal")
  expect(pickFromList(TEST_LIST, "zhihu", WORK_SOURCE).id).toBe("universal")
  // 来源是从平台导入：idea 对不上（要求灵感或直接新建）→ 通用
  expect(pickFromList(TEST_LIST, "zhihu", IMPORT_SOURCE).id).toBe("universal")
})

test("isUsable：requires 里的键在 settings 里都是 ok 才能用", () => {
  const workflow: WorkflowDef = { ...TEST_LIST[1]!, requires: ["cookies", "token"] }
  const settings = [
    { key: "cookies", status: "ok" as const },
    { key: "token", status: "ok" as const },
  ]
  expect(isUsable(workflow, settings)).toBe(true)
  expect(isUsable(workflow, [settings[0]!])).toBe(false)
  expect(isUsable(workflow, [settings[0]!, { key: "token", status: "missing" as const }])).toBe(false)
  expect(isUsable(workflow, [settings[0]!, { key: "token", status: "expired" as const }])).toBe(false)
  // 键对得上但另一个配置项重了名：找的是键相同且状态 ok 的那一条
  expect(isUsable({ ...workflow, requires: ["cookies"] }, [{ key: "cookies", status: "missing" as const }])).toBe(false)
  // 不需要配置的工作流总能用
  expect(isUsable(GENERAL_WRITE, [])).toBe(true)
})

test("fillTemplate：三个占位符都换，出现几次换几次", () => {
  const vars: StepVars = { folder: "C:/任务/b-12", platform: "知乎", account: "一叶之桐" }
  expect(fillTemplate("打开 {folder}/稿子.md，发到{platform}（{account}）。{folder} 里还有别的文件。", vars)).toBe(
    "打开 C:/任务/b-12/稿子.md，发到知乎（一叶之桐）。C:/任务/b-12 里还有别的文件。",
  )
  // 没有占位符的原样返回；别的花括号不动
  expect(fillTemplate("没有占位符", vars)).toBe("没有占位符")
  expect(fillTemplate("keep {other} {fold}", vars)).toBe("keep {other} {fold}")
})

test("fillTemplate：替换值中的美元符号和其他占位符保持原样", () => {
  const vars: StepVars = { folder: "任务$&", platform: "平台{account}$&", account: "省钱$$攻略" }
  expect(fillTemplate("{account} 到 {platform} / {folder}", vars)).toBe("省钱$$攻略 到 平台{account}$& / 任务$&")
})

test("WORKFLOWS 目录：M1 只有通用写稿，platform 和 from 都是 any", () => {
  expect(WORKFLOWS).toEqual([GENERAL_WRITE])
  expect(GENERAL_WRITE.platform).toBe("any")
  expect(GENERAL_WRITE.from).toBe("any")
})
