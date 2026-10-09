import { describe, expect, it } from "vitest"
import type { BootstrapScheduleView } from "../api/index.ts"
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
      schedules: [],
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

describe("定时拉数据没跑的提醒", () => {
  const dataPull: BootstrapScheduleView = {
    id: "data-pull",
    name: "拉作品数据",
    summary: "每天拉一次各账号的数据；拿数据的工具还没做的平台跳过。",
    when: "每天 06:00",
    installed: true,
  }

  function scheduleNotices(schedule: BootstrapScheduleView, today = "2026-10-08") {
    return notices({ works: [], accounts: [], pulls: [], schedules: [schedule], today })
  }

  // 基准是 today 的 0 点：10 月 8 日的 0 点往前数 36 小时是 10 月 6 日 12:00:00，刚好到点不算，多 1 秒才算
  it.each([
    ["刚好 36 小时", "2026-10-06T12:00:00+08:00", "2026-10-08", 0],
    ["多 1 秒", "2026-10-06T11:59:59+08:00", "2026-10-08", 1],
    ["昨天 0 点（24 小时）", "2026-10-07T00:00:00+08:00", "2026-10-08", 0],
    ["同一时刻换成前一天当 today（只有 12 小时）", "2026-10-06T11:59:59+08:00", "2026-10-07", 0],
    ["前一天当 today，早 36 小时多 1 秒", "2026-10-05T11:59:59+08:00", "2026-10-07", 1],
    ["跨年且时区偏移不同：按 IsoTime 自带的本地时间算", "2025-12-30T11:59:59-05:00", "2026-01-01", 1],
    ["上次运行晚于 today（时钟对不上）", "2026-10-09T08:00:00+08:00", "2026-10-08", 0],
  ])("上次运行%s → 提醒 %i 条", (_name, lastRunAt, today, count) => {
    expect(scheduleNotices({ ...dataPull, lastRunAt, lastResult: "ok" }, today)).toHaveLength(count)
  })

  it("超过 36 小时没运行：一条指向工作流页的风险提醒", () => {
    expect(
      scheduleNotices({
        ...dataPull,
        installedAt: "2026-10-01T08:00:00+08:00",
        lastRunAt: "2026-10-06T11:59:00+08:00",
        lastResult: "failed",
        lastNote: "一个账号拉取失败",
      }),
    ).toEqual([
      {
        id: "data:schedule:data-pull",
        kind: "data",
        tone: "risk",
        title: "定时拉数据超过一天半没跑了",
        detail: "上次运行在 10月6日 11:59",
        href: "/workflows/",
        at: "2026-10-06T11:59:00+08:00",
      },
    ])
    expect(scheduleNotices({ ...dataPull, lastRunAt: "2025-12-30T11:59:00+08:00" }, "2026-01-02")).toMatchObject([
      { detail: "上次运行在 2025年12月30日 11:59" },
    ])
  })

  it("装上后从没运行过：从装上的时间起算", () => {
    expect(scheduleNotices({ ...dataPull, installedAt: "2026-10-06T11:59:00+08:00" })).toEqual([
      {
        id: "data:schedule:data-pull",
        kind: "data",
        tone: "risk",
        title: "定时拉数据超过一天半没跑了",
        detail: "装上后还没运行过，装上时间 10月6日 11:59",
        href: "/workflows/",
        at: "2026-10-06T11:59:00+08:00",
      },
    ])
    expect(scheduleNotices({ ...dataPull, installedAt: "2026-10-06T12:00:00+08:00" })).toEqual([])
    expect(scheduleNotices({ ...dataPull, installedAt: "2026-10-08T08:00:00+08:00" })).toEqual([])
    // 状态里既没有运行记录也没有装上时间：没有依据，不提醒
    expect(scheduleNotices(dataPull)).toEqual([])
  })

  it("重新装上后从装上起算，上一轮留下的旧运行记录不会立刻报警", () => {
    const reinstalled: BootstrapScheduleView = {
      ...dataPull,
      lastRunAt: "2026-10-01T06:00:00+08:00",
      lastResult: "ok",
      installedAt: "2026-10-08T08:00:00+08:00",
    }
    expect(scheduleNotices(reinstalled)).toEqual([])
    expect(scheduleNotices({ ...reinstalled, installedAt: "2026-10-06T11:59:00+08:00" })).toMatchObject([
      { detail: "装上后还没运行过，装上时间 10月6日 11:59", at: "2026-10-06T11:59:00+08:00" },
    ])
  })

  it("时间读不出来时不提醒", () => {
    expect(scheduleNotices({ ...dataPull, lastRunAt: "不是时间" })).toEqual([])
    expect(scheduleNotices({ ...dataPull, installedAt: "" })).toEqual([])
  })

  it("没装的定时任务和不是拉数据的定时任务都不提醒", () => {
    const old = { lastRunAt: "2026-09-01T06:00:00+08:00", installedAt: "2026-08-01T06:00:00+08:00" }
    expect(scheduleNotices({ ...dataPull, ...old, installed: false })).toEqual([])
    expect(scheduleNotices({ ...dataPull, ...old, id: "idea-harvest", name: "跑灵感" })).toEqual([])
  })

  it("和别的提醒一起排：同属数据类，较新的在前", () => {
    const result = notices({
      works: [],
      accounts: [makeAccount("blog", "blog", { name: "博客号" })],
      pulls: [{ accountId: "blog", status: "failed", at: "2026-10-08T09:00:00+08:00", reason: "接口超时" }],
      schedules: [{ ...dataPull, lastRunAt: "2026-10-05T06:00:00+08:00" }],
      today: "2026-10-08",
    })

    expect(result.map((notice) => notice.id)).toEqual(["data:blog", "data:schedule:data-pull"])
  })
})
