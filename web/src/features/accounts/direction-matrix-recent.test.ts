import { describe, expect, it } from "vitest"

import { LATEST_DAY, addDays } from "@/data/clock"
import { workById } from "@/data/works"
import { RECENT_DAYS, publishedRecently } from "./direction-matrix-recent"

describe("方向对照：近 30 天发了几个作品", () => {
  it("知乎 7、博客 11、B站 0、小红书 0", () => {
    expect(publishedRecently("zhihu-yiye")).toBe(7)
    expect(publishedRecently("blog-chaosyn")).toBe(11)
    expect(publishedRecently("bili-yiye")).toBe(0)
    expect(publishedRecently("xhs-yiye")).toBe(0)
  })

  it("窗口含最新一天往前数的第 30 天：正好发在那天的知乎作品算在 7 个里", () => {
    expect(RECENT_DAYS).toBe(30)
    const firstDay = addDays(LATEST_DAY, -29)
    expect(workById("z-minimax-5090").publishedAt).toBe(firstDay)
    expect(workById("z-minimax-5090").status).toBe("done")
    expect(publishedRecently("zhihu-yiye")).toBe(7)
  })
})
