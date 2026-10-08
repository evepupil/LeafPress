import { describe, expect, it } from "vitest"

import type { Work } from "@/data/types"
import { WORKS } from "@/data/works"
import {
  cardTimeText,
  emptyColumnText,
  interactionOf,
  moreCount,
  platformCounts,
  readWorksParams,
  sourceMarkOf,
  todoQueue,
  withParam,
  workColumns,
  worksHref,
} from "./works-model"

function work(id: string): Work {
  const found = WORKS.find((item) => item.id === id)
  if (!found) throw new Error(`演示数据里没有 ${id}`)
  return found
}

describe("地址栏参数", () => {
  it("没有参数：看板、全部平台、不限状态、没有打开的作品", () => {
    expect(readWorksParams(new URLSearchParams(""))).toEqual({ view: "board", platform: "all", status: null, openId: null })
  })

  it("读出列表视图、平台、只看哪一列、打开的作品", () => {
    const params = new URLSearchParams("view=list&platform=zhihu&status=waiting&open=z-design-extraction")
    expect(readWorksParams(params)).toEqual({ view: "list", platform: "zhihu", status: "waiting", openId: "z-design-extraction" })
  })

  it("不认识的值当作没写", () => {
    const params = new URLSearchParams("view=grid&platform=weibo&status=constructor&open=")
    expect(readWorksParams(params)).toEqual({ view: "board", platform: "all", status: null, openId: null })
  })

  it("改一项时保留其他参数", () => {
    expect(withParam("status=waiting", "open", "z-1")).toBe("status=waiting&open=z-1")
    expect(withParam("status=waiting&open=z-1", "open", null)).toBe("status=waiting")
  })

  it("默认值不写进地址栏", () => {
    expect(withParam("view=list", "view", "board")).toBe("")
    expect(withParam("platform=zhihu&open=z-1", "platform", "all")).toBe("open=z-1")
    expect(withParam("", "view", "list")).toBe("view=list")
  })

  it("没有参数时地址就是 /", () => {
    expect(worksHref("")).toBe("/")
    expect(worksHref("view=list")).toBe("/?view=list")
  })
})

describe("筛选栏的数字", () => {
  it("不搜索：全部 64、博客 40、知乎 22、B站 1、小红书 1", () => {
    expect(platformCounts(WORKS, "")).toEqual({ all: 64, blog: 40, zhihu: 22, bilibili: 1, xiaohongshu: 1 })
  })

  it("搜 tunnel：7 个，按搜索词筛过、不按平台筛", () => {
    const counts = platformCounts(WORKS, "tunnel")
    expect(counts.all).toBe(7)
    expect(counts.blog + counts.zhihu + counts.bilibili + counts.xiaohongshu).toBe(7)
  })
})

describe("看板分列", () => {
  it("四列：待实现 6、进行中 1、等你处理 4、已完成 53", () => {
    const columns = workColumns(WORKS, null)
    expect(columns.map((column) => [column.status, column.items.length])).toEqual([
      ["todo", 6],
      ["doing", 1],
      ["waiting", 4],
      ["done", 53],
    ])
  })

  it("只看一列时只有那一列，里面第一张是最近变动的", () => {
    const columns = workColumns(WORKS, "waiting")
    expect(columns).toHaveLength(1)
    expect(columns[0].status).toBe("waiting")
    expect(columns[0].items[0].id).toBe("z-leafpress-intro")
  })

  it("待实现的队伍：b-tunnel-access 排第一，位置从 1 数起", () => {
    const queue = todoQueue(WORKS)
    expect(queue.frontId).toBe("b-tunnel-access")
    expect(queue.positions.get("b-tunnel-access")).toBe(1)
    expect(queue.positions.size).toBe(6)
    expect([...queue.positions.values()]).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("没有待实现的作品时没有第一名", () => {
    expect(todoQueue(WORKS.filter((item) => item.status !== "todo")).frontId).toBeNull()
  })

  it("已完成一列每次多显示 20 个，最后一次只剩多少显示多少", () => {
    expect(moreCount(53, 20)).toBe(20)
    expect(moreCount(53, 40)).toBe(13)
    expect(moreCount(53, 53)).toBe(0)
  })

  it("空列的一句话：等你处理那一列单独写", () => {
    expect(emptyColumnText("waiting")).toBe("没有等你处理的作品")
    expect(emptyColumnText("todo")).toBe("这一列是空的")
    expect(emptyColumnText("done")).toBe("这一列是空的")
  })
})

describe("卡片上的字", () => {
  it("右上角小字：待实现是排位，已完成是发布日期", () => {
    expect(cardTimeText(work("b-tunnel-access"), 1)).toBe("#1")
    expect(cardTimeText(work("b-tunnel-access"), undefined)).toBeNull()
    expect(cardTimeText(work("z-chatgpt-mcp"), undefined)).toBe("7/29")
  })

  it("来源标记：灵感转来的、别的作品转来的、导入和新建的没有", () => {
    const fromIdea: Work = { ...work("b-tunnel-access"), source: { kind: "idea", ideaId: "i-01" } }
    const fromBlog = work("z-chatgpt-mcp")
    const blogPost = work("chatgpt-mcp-3a94342e")
    expect(sourceMarkOf(fromIdea, undefined)).toBe("来自灵感")
    expect(sourceMarkOf(fromBlog, blogPost)).toBe("由博客转")
    expect(sourceMarkOf(fromBlog, undefined)).toBeNull()
    expect(sourceMarkOf(blogPost, undefined)).toBeNull()
  })

  it("已完成的互动数：博客只有评论，知乎是赞同 + 收藏 + 评论，没发的没有", () => {
    const post = work("chatgpt-mcp-3a94342e")
    expect(interactionOf(post)).toEqual({ kind: "comments", value: post.totals?.comments })
    expect(interactionOf(work("z-chatgpt-mcp"))).toEqual({ kind: "reactions", value: 702 + 1380 + 88 })
    expect(interactionOf(work("b-tunnel-access"))).toBeNull()
  })
})
