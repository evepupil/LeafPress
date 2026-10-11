import { describe, expect, it } from "vitest"

import { PLATFORMS } from "../catalog/index.ts"
import { combinedSecondary, secondaryColumnLabel, secondaryOf, secondaryValue } from "./secondary.ts"

describe("第二个数：互动还是访客", () => {
  it("知乎有互动类数据项，第二个数是互动；博客没有，第二个数是访客", () => {
    expect(secondaryOf(PLATFORMS.zhihu)).toEqual({ kind: "interactions", label: "互动" })
    expect(secondaryOf(PLATFORMS.blog)).toEqual({ kind: "metric", key: "visitors", label: "访客" })
  })

  it("从累计数里取第二个数", () => {
    expect(secondaryValue(PLATFORMS.zhihu, { views: 100, likes: 3, collects: 2, comments: 1, shares: 4 })).toBe(10)
    expect(secondaryValue(PLATFORMS.blog, { pageviews: 100, visitors: 37 })).toBe(37)
    expect(secondaryValue(PLATFORMS.blog, { pageviews: 100 })).toBe(0)
  })

  it("几个账号合计时只合计互动；只看博客时合计访客", () => {
    const mixed = combinedSecondary([PLATFORMS.zhihu, PLATFORMS.blog])
    expect(mixed.label).toBe("互动")
    expect(mixed.includes(PLATFORMS.zhihu)).toBe(true)
    expect(mixed.includes(PLATFORMS.blog)).toBe(false)
    const blogOnly = combinedSecondary([PLATFORMS.blog])
    expect(blogOnly.label).toBe("访客")
    expect(blogOnly.includes(PLATFORMS.blog)).toBe(true)
  })

  it("表格列名：一样就用它，混在一起写「互动 / 访客」", () => {
    expect(secondaryColumnLabel([PLATFORMS.zhihu])).toBe("互动")
    expect(secondaryColumnLabel([PLATFORMS.blog])).toBe("访客")
    expect(secondaryColumnLabel([PLATFORMS.blog, PLATFORMS.zhihu])).toBe("互动 / 访客")
    expect(secondaryColumnLabel([])).toBe("互动")
  })
})
