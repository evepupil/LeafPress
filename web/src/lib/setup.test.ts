import { describe, expect, it } from "vitest"

import { ACCOUNTS, accountById } from "@/data/accounts"
import { effectiveSource, pullData, setupItems, setupView } from "./setup"

describe("接入状态", () => {
  it("知乎接好了：有能用的工作流、接口正常、配置齐；回答工作流要配置只列在还缺什么里", () => {
    const view = setupView(accountById("zhihu-yiye"))
    expect(view.state).toBe("ready")
    expect(view.readyWorkflows).toBe(2)
    expect(view.gaps).toEqual(["「博客转知乎回答」要配置"])
    expect(view.metrics.map((item) => item.label)).toEqual(["浏览", "点赞", "收藏", "评论", "分享"])
  })

  it("博客有问题：统计拉取失败、Umami 密钥过期", () => {
    const view = setupView(accountById("blog-chaosyn"))
    expect(view.state).toBe("broken")
    expect(view.gaps).toEqual(["数据拉取失败：统计接口返回 401", "Umami API 密钥已过期"])
  })

  it("B站、小红书没接完：拿数据的工具还没做，还有配置没填", () => {
    expect(setupView(accountById("bili-yiye")).state).toBe("unfinished")
    expect(setupView(accountById("bili-yiye")).gaps).toEqual(["拿数据的工具还没做", "投稿工具 biliup 登录未配置", "创作中心登录未配置"])
    expect(setupView(accountById("xhs-yiye")).state).toBe("unfinished")
  })

  it("页面上填了值就算配好；只填空白不算", () => {
    const blog = accountById("blog-chaosyn")
    expect(setupItems(blog, { "umami-key": "  " }).find((item) => item.key === "umami-key")?.status).toBe("expired")
    expect(setupItems(blog, { "umami-key": "new-key" }).find((item) => item.key === "umami-key")).toMatchObject({
      status: "ok",
      value: "new-key",
    })
  })
})

describe("拉一次数据", () => {
  it("初始配置：博客的密钥过期拉不到，知乎正常，B站、小红书没接跳过", () => {
    const { outcomes, note } = pullData(ACCOUNTS)
    expect(outcomes).toEqual([
      { accountId: "zhihu-yiye", status: "ok" },
      { accountId: "blog-chaosyn", status: "failed", reason: "统计接口返回 401" },
    ])
    expect(note).toBe("技术博客：统计接口返回 401，其余已入库")
  })

  it("填好 Umami 密钥再拉：全部入库，博客变成接好了", () => {
    const config = { "blog-chaosyn": { "umami-key": "new-key" } }
    const { outcomes, note } = pullData(ACCOUNTS, config)
    expect(note).toBe("全部入库")
    const pull = { status: outcomes[1].status, at: "2026-10-08T09:31:00+08:00" }
    const blog = accountById("blog-chaosyn")
    expect(effectiveSource(blog, pull)).toMatchObject({ status: "ok", lastPullAt: "2026-10-08T09:31:00+08:00", failReason: undefined })
    expect(setupView(blog, config["blog-chaosyn"], pull).state).toBe("ready")
  })

  it("还没接的号，页面上的拉取结果不算数", () => {
    const bili = accountById("bili-yiye")
    expect(effectiveSource(bili, { status: "ok", at: "2026-10-08T09:31:00+08:00" }).status).toBe("missing")
  })
})
