import { describe, expect, it } from "vitest"

import type { ImportSummary } from "@leafpress/core"
import { describeImport } from "./import-summary"

function summary(patch: Partial<ImportSummary> = {}): ImportSummary {
  return { added: 0, skipped: 0, drafts: 0, issues: [], works: [], ...patch }
}

describe("导入文章完成后的提示", () => {
  it("只有新增和已有时只说一句", () => {
    expect(describeImport(summary({ added: 38, skipped: 1 }))).toEqual({
      tone: "success",
      title: "导入 38 篇，1 篇已经有了",
    })
  })

  it("什么都没导入时照样说清楚", () => {
    expect(describeImport(summary({ skipped: 39 }))).toEqual({
      tone: "success",
      title: "导入 0 篇，39 篇已经有了",
    })
  })

  it("有草稿时补一句跳过了几篇草稿", () => {
    expect(describeImport(summary({ added: 5, drafts: 2 }))).toEqual({
      tone: "success",
      title: "导入 5 篇，0 篇已经有了",
      detail: "跳过 2 篇草稿",
    })
  })

  it("有读不了的文章时补一句几篇读不了，并用警示语气", () => {
    const issues = [{ path: "content/posts/zh/broken.mdx", message: "缺少 title" }]
    expect(describeImport(summary({ added: 5, skipped: 1, issues }))).toEqual({
      tone: "warning",
      title: "导入 5 篇，1 篇已经有了",
      detail: "1 篇读不了",
    })
  })

  it("草稿和读不了的都有时合成一句", () => {
    const issues = [
      { path: "a.mdx", message: "缺少 title" },
      { path: "b.mdx", message: "frontmatter 解析失败" },
    ]
    expect(describeImport(summary({ added: 3, skipped: 4, drafts: 2, issues }))).toEqual({
      tone: "warning",
      title: "导入 3 篇，4 篇已经有了",
      detail: "跳过 2 篇草稿，2 篇读不了",
    })
  })
})
