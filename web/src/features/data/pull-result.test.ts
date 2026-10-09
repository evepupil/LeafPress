import { describe, expect, it } from "vitest"

import type { PullResult } from "@leafpress/core"
import { describePull } from "./pull-result"

const version = { seq: 3, snapshotSeq: 2, profilesStamp: 1 }

function result(patch: Partial<PullResult>): PullResult {
  return { ok: true, version, outcomes: [], note: "", ...patch }
}

describe("拉数据完成后的提示", () => {
  it("都入库了：用服务端的 note 当标题，语气是成功", () => {
    const pulled = result({
      outcomes: [{ accountId: "blog-1", status: "ok" }],
      note: "入库 40 篇文章，补了 190 天历史",
    })
    expect(describePull(pulled)).toEqual({ tone: "success", title: "入库 40 篇文章，补了 190 天历史" })
  })

  it("有账号没拉成：note 里写着原因，语气是警示", () => {
    const pulled = result({
      outcomes: [
        { accountId: "blog-1", status: "failed", reason: "统计接口返回 401" },
        { accountId: "zhihu-1", status: "ok" },
      ],
      note: "博客：统计接口返回 401，其余已入库",
    })
    expect(describePull(pulled)).toEqual({ tone: "warning", title: "博客：统计接口返回 401，其余已入库" })
  })

  it("全部没拉成也是警示，不当成成功", () => {
    const pulled = result({
      outcomes: [{ accountId: "blog-1", status: "failed", reason: "Umami 共享链接未配置" }],
      note: "博客：Umami 共享链接未配置",
    })
    expect(describePull(pulled)).toEqual({ tone: "warning", title: "博客：Umami 共享链接未配置" })
  })

  it("没有能拉的账号：只是告知", () => {
    expect(describePull(result({ note: "没有能拉的账号" }))).toEqual({ tone: "info", title: "没有能拉的账号" })
  })
})
