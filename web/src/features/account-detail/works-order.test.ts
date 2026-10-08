import { describe, expect, it } from "vitest"

import { ACCOUNTS } from "@/data/accounts"
import { PUBLICATIONS } from "@/data/works"
import { orderAccountPubs } from "./works-order"

describe("账号页的作品顺序", () => {
  it("知乎共 19 个版本，前 8 个：待回填、已排期、三篇草稿、三篇最近发的", () => {
    const pubs = orderAccountPubs("zhihu-yiye")
    expect(pubs).toHaveLength(19)
    expect(pubs.slice(0, 8).map((pub) => pub.id)).toEqual([
      "zh-design-extraction",
      "zh-jev",
      "zh-reasoning",
      "zh-leafpress-intro",
      "zh-fleet-truncation",
      "zh-edge-answer",
      "zh-r2-oci",
      "zh-ai-frontend",
    ])
  })

  it("知乎：已发 14、待回填 1、已排期 1、草稿 3", () => {
    const states = orderAccountPubs("zhihu-yiye").map((pub) => pub.state)
    const count = (state: string) => states.filter((item) => item === state).length
    expect([count("published"), count("pending-link"), count("scheduled"), count("draft")]).toEqual([14, 1, 1, 3])
  })

  it("已发的版本发布日一路往前，没发的全排在已发前面", () => {
    for (const account of ACCOUNTS) {
      const pubs = orderAccountPubs(account.id)
      const firstPublished = pubs.findIndex((pub) => pub.state === "published")
      if (firstPublished >= 0) {
        expect(pubs.slice(0, firstPublished).every((pub) => pub.state !== "published")).toBe(true)
        const days = pubs.slice(firstPublished).map((pub) => pub.publishedAt ?? "")
        expect(days).toEqual([...days].sort((a, b) => b.localeCompare(a)))
      }
    }
  })

  it("同一天发的，编号大的在前；草稿排在已发前面", () => {
    expect(orderAccountPubs("wechat-acg").map((pub) => pub.id)).toEqual(["wx-acg-184", "wx-acg-183", "wx-acg-182"])
  })

  it("每个账号的版本一个不少", () => {
    for (const account of ACCOUNTS) {
      expect(orderAccountPubs(account.id)).toHaveLength(PUBLICATIONS.filter((pub) => pub.accountId === account.id).length)
    }
    expect(orderAccountPubs("blog-chaosyn")).toHaveLength(40)
  })
})
