import { describe, expect, it } from "vitest"

import { copyPageUrl, COPY_PAGE_FILE } from "./work-sheet-copy-page"

describe("复制页地址", () => {
  it("文件名单里有知乎发布稿时给出接口地址", () => {
    expect(copyPageUrl("work-1", [COPY_PAGE_FILE])).toBe("/api/works/work-1/files/%E7%9F%A5%E4%B9%8E%E5%8F%91%E5%B8%83%E7%A8%BF.html")
    expect(copyPageUrl("work-1", ["稿子.md", COPY_PAGE_FILE])).toBe(
      "/api/works/work-1/files/%E7%9F%A5%E4%B9%8E%E5%8F%91%E5%B8%83%E7%A8%BF.html",
    )
  })
  it("名单里没有知乎发布稿时没有地址", () => {
    expect(copyPageUrl("work-1", [])).toBeUndefined()
    expect(copyPageUrl("work-1", ["稿子.md"])).toBeUndefined()
  })
})
