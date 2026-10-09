import { describe, expect, it } from "vitest"

import type { Account, Idea, Work } from "../types/index.ts"
import { defaultBrief, workSourceOf, convert } from "./convert.ts"

const at = "2026-10-08T09:30:00+08:00"
const account = (id: string, platform: Account["platform"]): Account => ({
  id,
  platform,
  name: `账号 ${id}`,
  stage: "active",
  since: "2026-01-01",
  profile: "",
  profilePath: `/profiles/${id}.md`,
  settings: [],
  createdAt: at,
  updatedAt: at,
})
const idea: Idea = {
  id: "i-12",
  text: "  解释状态机  ",
  detail: "  从状态转移讲起  ",
  status: "promising",
  source: "quick",
  accountId: "zhihu-1",
  order: 2,
  createdAt: at,
  updatedAt: at,
  workIds: [],
}
const origin: Work = {
  id: "b-4",
  title: "  原作品标题  ",
  accountId: "blog-1",
  status: "done",
  brief: "原文要求",
  source: { kind: "none" },
  workflowId: "general-write",
  step: 3,
  feedbackHistory: [],
  order: 0,
  createdAt: at,
  updatedAt: at,
  tags: [],
  log: [],
}

describe("转作品", () => {
  it("一条灵感转多个账号，逐个编号排序并去掉 brief 首尾空白", () => {
    const source = { kind: "idea", idea } as const
    const works = convert(
      source,
      [account("zhihu-1", "zhihu"), account("blog-1", "blog"), account("bili-1", "bilibili")],
      defaultBrief(source),
      {
        at,
        ids: ["z-21", "b-22", "v-23"],
        firstOrder: 5,
      },
    )
    expect(works.map((item) => [item.id, item.accountId, item.workflowId, item.order])).toEqual([
      ["z-21", "zhihu-1", "general-write", 5],
      ["b-22", "blog-1", "blog-write", 6],
      ["v-23", "bili-1", "general-write", 7],
    ])
    expect(works[0]).toMatchObject({
      title: "  解释状态机  ",
      brief: "从状态转移讲起",
      source: { kind: "idea", ideaId: "i-12" },
      tags: [],
      feedbackHistory: [],
    })
    expect(works[0]?.log[0]?.text).toBe("创建，由灵感转来，用「通用写稿」工作流")
    expect(idea.workIds).toEqual([])
  })

  it("作品来源保留编号，按来源平台传给工作流选择", () => {
    const source = { kind: "work", work: origin, platform: "blog" } as const
    const [created] = convert(source, [account("zhihu-1", "zhihu")], "  改写  ", { at, ids: ["z-30"], firstOrder: 1 })
    expect(workSourceOf(source)).toEqual({ kind: "work", workId: "b-4" })
    expect(defaultBrief(source)).toBe("照这个平台的写法改写，文末附原文链接。")
    expect(created).toMatchObject({ title: "  原作品标题  ", brief: "改写", source: { kind: "work", workId: "b-4" } })
    expect(created?.log[0]?.text).toBe("创建，由《  原作品标题  》转来，用「通用写稿」工作流")
  })

  it("直接新建标题去空白，默认要求为空且来源为 none", () => {
    const source = { kind: "new", title: "  新选题  " } as const
    const [created] = convert(source, [account("zhihu-1", "zhihu")], "", { at, ids: ["z-31"], firstOrder: 0 })
    expect(defaultBrief(source)).toBe("")
    expect(created).toMatchObject({ title: "新选题", source: { kind: "none" }, workflowId: "general-write", brief: "" })
    expect(created?.log[0]?.text).toBe("创建，直接新建，用「通用写稿」工作流")
  })
})
