import { describe, expect, it } from "vitest"

import type { Account, Work } from "@leafpress/core"
import {
  cardMetrics,
  cardTimeText,
  emptyColumnText,
  filterWorks,
  moreCount,
  moveWorkPreview,
  platformCounts,
  readWorksParams,
  sourceMarkOf,
  todoQueue,
  withParam,
  workColumns,
  worksHref,
} from "./works-model"

const ACCOUNTS: Account[] = [
  {
    id: "blog-1",
    platform: "blog",
    name: "博客",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: "",
    settings: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "zhihu-1",
    platform: "zhihu",
    name: "知乎",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: "",
    settings: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
]
function work(id: string, status: Work["status"] = "todo", extra: Partial<Work> = {}): Work {
  return {
    id,
    title: `${id} title`,
    accountId: id.startsWith("z-") ? "zhihu-1" : "blog-1",
    status,
    brief: "",
    source: { kind: "none" },
    workflowId: "general-write",
    step: 0,
    order: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    feedbackHistory: [],
    tags: [],
    log: [],
    ...extra,
  }
}
const WORKS: Work[] = [
  work("b-1", "todo", { order: 1 }),
  work("z-1", "todo", { order: 2 }),
  work("b-2", "doing"),
  work("z-2", "waiting"),
  work("b-3", "done", { publishedAt: "2026-10-08", totals: { pageviews: 800, comments: 12 } }),
]

describe("地址栏参数", () => {
  it("没有参数使用默认值", () =>
    expect(readWorksParams(new URLSearchParams(""))).toEqual({
      view: "board",
      platform: "all",
      status: null,
      openId: null,
      accountId: null,
    }))
  it("读取有效参数并忽略无效值", () => {
    expect(readWorksParams(new URLSearchParams("view=list&platform=zhihu&status=waiting&open=z-1"))).toEqual({
      view: "list",
      platform: "zhihu",
      status: "waiting",
      openId: "z-1",
      accountId: null,
    })
    expect(readWorksParams(new URLSearchParams("view=grid&platform=weibo&status=bad&open="))).toEqual({
      view: "board",
      platform: "all",
      status: null,
      openId: null,
      accountId: null,
    })
  })
  it("保留其他参数并省略默认值", () => {
    expect(withParam("status=waiting", "open", "z-1")).toBe("status=waiting&open=z-1")
    expect(withParam("status=waiting&open=z-1", "open", null)).toBe("status=waiting")
    expect(withParam("view=list&account=blog-1", "account", null)).toBe("view=list")
    expect(withParam("view=list", "view", "board")).toBe("")
    expect(worksHref("view=list")).toBe("/?view=list")
  })
})

describe("作品模型", () => {
  it("按账号所属平台统计搜索结果", () =>
    expect(platformCounts(WORKS, "", ACCOUNTS)).toEqual({ all: 5, blog: 3, zhihu: 2, bilibili: 0, xiaohongshu: 0 }))
  it("筛选账号时只保留该账号的作品", () => {
    expect(filterWorks(WORKS, { platform: "all", query: "", accountId: "blog-1" }, ACCOUNTS).map((item) => item.id)).toEqual([
      "b-1",
      "b-2",
      "b-3",
    ])
    expect(platformCounts(WORKS, "", ACCOUNTS, "blog-1").all).toBe(3)
  })
  it("预览拖动时立即使用 core 队列顺序", () => {
    const next = moveWorkPreview(WORKS, "b-2", "todo", "b-1", "2026-10-08T12:00:00Z")
    expect(next.find((item) => item.id === "b-2")).toMatchObject({ status: "todo", order: 1, updatedAt: "2026-10-08T12:00:00Z" })
    expect(next.find((item) => item.id === "b-1")?.order).toBe(2)
    expect(WORKS.find((item) => item.id === "b-2")?.status).toBe("doing")
  })
  it("分列保持 core 顺序并支持单列筛选", () => {
    expect(workColumns(WORKS, null).map((column) => [column.status, column.items.length])).toEqual([
      ["todo", 2],
      ["doing", 1],
      ["waiting", 1],
      ["done", 1],
    ])
    expect(workColumns(WORKS, "waiting")[0]?.items[0]?.id).toBe("z-2")
  })
  it("计算待实现位置、空列和已完成分页数", () => {
    expect([...todoQueue(WORKS).positions.values()]).toEqual([1, 2])
    expect(todoQueue(WORKS).frontId).toBe("b-1")
    expect(emptyColumnText("waiting")).toBe("没有等你处理的作品")
    expect(emptyColumnText("todo")).toBe("这一列是空的")
    expect(moreCount(53, 40)).toBe(13)
  })
  it("显示卡片时间、来源和平台指标", () => {
    expect(cardTimeText(work("b-1"), 1, "2026-10-08T00:00:00Z")).toBe("#1")
    expect(cardTimeText(work("b-1"), undefined, "2026-10-08T00:00:00Z")).toBeNull()
    const fromIdea = work("b-1", "todo", { source: { kind: "idea", ideaId: "idea-1" } })
    const fromWork = work("z-3", "todo", { source: { kind: "work", workId: "b-1" } })
    expect(sourceMarkOf(fromIdea, undefined, ACCOUNTS)).toBe("来自灵感")
    expect(sourceMarkOf(fromWork, work("b-1"), ACCOUNTS)).toBe("由博客转")
    expect(cardMetrics(work("b-3", "done", { totals: { pageviews: 800, comments: 12 } }), "blog")).toEqual([{ label: "访问", value: 800 }])
    expect(cardMetrics(work("b-1"), "blog")).toEqual([])
  })
})
