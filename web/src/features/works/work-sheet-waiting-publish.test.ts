import { describe, expect, it } from "vitest"

import { publishPageUrl, publishPageUrlOf } from "./work-sheet-waiting-publish"

describe("发布稿地址", () => {
  it("编号和文件名都编码", () => {
    expect(publishPageUrl("work-1", "知乎发布稿.html")).toBe("/api/works/work-1/files/%E7%9F%A5%E4%B9%8E%E5%8F%91%E5%B8%83%E7%A8%BF.html")
    expect(publishPageUrl("work-1", "小红书发布稿.html")).toBe(
      "/api/works/work-1/files/%E5%B0%8F%E7%BA%A2%E4%B9%A6%E5%8F%91%E5%B8%83%E7%A8%BF.html",
    )
    expect(publishPageUrl("工 1", "知乎发布稿.html")).toBe(
      "/api/works/%E5%B7%A5%201/files/%E7%9F%A5%E4%B9%8E%E5%8F%91%E5%B8%83%E7%A8%BF.html",
    )
  })
  it("没有任务详情时没有地址", () => {
    expect(publishPageUrlOf("work-1")).toBeUndefined()
  })
})
