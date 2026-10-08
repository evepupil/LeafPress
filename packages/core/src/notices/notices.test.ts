import { describe, expect, it } from "vitest"
import { makeAccount, makeWork } from "../metrics/test-fixtures.ts"
import { accountHref, notices, workHref } from "./notices.ts"

describe("提醒", () => {
  it("生成失败、断更、等你处理提醒并按类别和时间排序", () => {
    const zhihu = makeAccount("a /b", "zhihu", { name: "知乎号" })
    const blog = makeAccount("blog", "blog", { name: "博客号" })
    const bilibili = makeAccount("video", "bilibili", { name: "视频号", stage: "paused" })
    const works = [
      makeWork("old-zhihu", "a /b", "2026-09-20", { updatedAt: "2026-10-06T08:00:00+08:00" }),
      makeWork("old-blog", "blog", "2026-09-23", { updatedAt: "2026-10-07T08:00:00+08:00" }),
      makeWork("manual-wait", "a /b", undefined, {
        status: "waiting",
        workflowId: "general-write",
        step: 1,
        title: "待发布内容",
        updatedAt: "2026-10-08T09:00:00+08:00",
      }),
      makeWork("unknown-wait", "a /b", undefined, {
        status: "waiting",
        workflowId: "unknown-workflow",
        title: "流程已移除",
        updatedAt: "2026-10-08T11:00:00+08:00",
      }),
      makeWork("automatic-wait", "a /b", undefined, {
        status: "waiting",
        workflowId: "general-write",
        step: 2,
        title: "自动步骤仍等待",
        updatedAt: "2026-10-08T10:00:00+08:00",
      }),
    ]
    const result = notices({
      works,
      accounts: [zhihu, blog, bilibili],
      pulls: [
        { accountId: "a /b", status: "failed", at: "2026-10-07T10:00:00+08:00", reason: "旧失败" },
        { accountId: "a /b", status: "ok", at: "2026-10-08T08:00:00+08:00" },
        { accountId: "blog", status: "failed", at: "2026-10-08T09:00:00+08:00", reason: "接口超时" },
        { accountId: "video", status: "failed", at: "2026-10-08T10:00:00+08:00", reason: "登录失效" },
        { accountId: "video", status: "ok", at: "2026-10-08T09:30:00+08:00" },
      ],
      today: "2026-10-08",
    })

    expect(result.map((notice) => [notice.kind, notice.id])).toEqual([
      ["data", "data:video"],
      ["data", "data:blog"],
      ["stale", "stale:blog"],
      ["stale", "stale:a /b"],
      ["waiting", "waiting:unknown-wait"],
      ["waiting", "waiting:automatic-wait"],
      ["waiting", "waiting:manual-wait"],
    ])
    expect(result[0]).toEqual({
      id: "data:video",
      kind: "data",
      tone: "risk",
      title: "视频号数据拉取失败",
      detail: "登录失效",
      href: "/data/#sources",
      at: "2026-10-08T10:00:00+08:00",
    })
    expect(result[2]).toMatchObject({
      title: "博客号 15 天没更新",
      detail: "上次发布在9月23日",
      href: "/account/?id=blog",
      at: "2026-10-07T08:00:00+08:00",
    })
    expect(result[4]).toMatchObject({ title: "流程已移除", detail: "知乎 · 等你处理", href: "/?open=unknown-wait" })
    expect(result[5]).toMatchObject({ title: "自动步骤仍等待", detail: "知乎 · 你来看一下" })
    expect(result[6]).toMatchObject({ title: "待发布内容", detail: "知乎 · 你去发布", href: "/?open=manual-wait" })
  })

  it("账号作品链接的编号按约定编码", () => {
    expect(workHref("z-101")).toBe("/?open=z-101")
    expect(accountHref("a /b?c")).toBe("/account/?id=a%20%2Fb%3Fc")
  })
})
