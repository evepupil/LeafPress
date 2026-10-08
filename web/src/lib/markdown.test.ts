import { describe, expect, it } from "vitest"

import { accountById } from "@/data/accounts"
import { markdownSummary, parseInline, parseMarkdown } from "./markdown"

describe("行内格式", () => {
  it("粗体、代码、链接，其余原样", () => {
    expect(parseInline("先看 **禁用词**，再跑 `pnpm gate`，见[博客](https://blog.chaosyn.com/)。")).toEqual([
      { kind: "text", text: "先看 " },
      { kind: "strong", text: "禁用词" },
      { kind: "text", text: "，再跑 " },
      { kind: "code", text: "pnpm gate" },
      { kind: "text", text: "，见" },
      { kind: "link", text: "博客", href: "https://blog.chaosyn.com/" },
      { kind: "text", text: "。" },
    ])
    expect(parseInline("没有格式")).toEqual([{ kind: "text", text: "没有格式" }])
  })
})

describe("块", () => {
  it("标题、段落（行内换行保留）、列表、引用、代码块、分隔线", () => {
    const blocks = parseMarkdown("## 定位\n\n第一行\n第二行\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n> 引用\n\n```\ncode\n```\n\n---\n")
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list", "list", "quote", "code", "rule"])
    expect(blocks[1]).toEqual({ kind: "paragraph", inline: [{ kind: "text", text: "第一行\n第二行" }] })
    expect(blocks[2]).toMatchObject({ kind: "list", ordered: false })
    expect(blocks[3]).toMatchObject({ kind: "list", ordered: true })
    expect(blocks[5]).toEqual({ kind: "code", text: "code" })
  })

  it("表格：表头加数据行", () => {
    const [table] = parseMarkdown("| 账号 | 学什么 |\n|---|---|\n| 代码与认知 | 结构清楚 |\n| 工程师的经济学 | 落到工程决策 |")
    expect(table.kind).toBe("table")
    if (table.kind !== "table") return
    expect(table.header).toHaveLength(2)
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1][0]).toEqual([{ kind: "text", text: "工程师的经济学" }])
  })

  it("四级以下的标题按三级算；空文档没有块", () => {
    expect(parseMarkdown("#### 小标题")).toEqual([{ kind: "heading", level: 3, inline: [{ kind: "text", text: "小标题" }] }])
    expect(parseMarkdown("   \n\n")).toEqual([])
  })
})

describe("一句话简介", () => {
  it("取第一个段落，跳过标题，去掉格式", () => {
    expect(markdownSummary(accountById("zhihu-yiye").profile)).toBe("把 AI 工程化和计算机里的一套方法、一个机制讲透的技术说明文。")
    expect(markdownSummary("## 只有标题")).toBe("")
    expect(markdownSummary("很长".repeat(50), 10)).toBe("很长很长很长很长很…")
  })
})
