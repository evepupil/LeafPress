import { describe, expect, it } from "vitest"
import { markdownSummary, parseInline, parseMarkdown } from "./markdown.ts"

describe("行内格式", () => {
  it("粗体、代码、链接，其余原样", () => {
    expect(parseInline("先看 **禁用词**，再跑 `pnpm gate`，见[博客](https://example.com/)。")).toEqual([
      { kind: "text", text: "先看 " },
      { kind: "strong", text: "禁用词" },
      { kind: "text", text: "，再跑 " },
      { kind: "code", text: "pnpm gate" },
      { kind: "text", text: "，见" },
      { kind: "link", text: "博客", href: "https://example.com/" },
      { kind: "text", text: "。" },
    ])
    expect(parseInline("没有格式")).toEqual([{ kind: "text", text: "没有格式" }])
  })
})

describe("块结构", () => {
  it("标题、段落、列表、引用、代码块和分隔线", () => {
    const blocks = parseMarkdown("## 定位\n\n第一行\n第二行\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n> 引用\n\n```\ncode\n```\n\n---\n")
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list", "list", "quote", "code", "rule"])
    expect(blocks[1]).toEqual({ kind: "paragraph", inline: [{ kind: "text", text: "第一行\n第二行" }] })
    expect(blocks[2]).toMatchObject({ kind: "list", ordered: false })
    expect(blocks[3]).toMatchObject({ kind: "list", ordered: true })
    expect(blocks[5]).toEqual({ kind: "code", text: "code" })
  })

  it("表格解析表头和数据行", () => {
    const [table] = parseMarkdown("| 账号 | 学什么 |\n|---|---|\n| 代码与认知 | 结构清楚 |\n| 工程师经济学 | 工程决策 |")
    expect(table?.kind).toBe("table")
    if (!table || table.kind !== "table") return
    expect(table.header).toHaveLength(2)
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]?.[0]).toEqual([{ kind: "text", text: "工程师经济学" }])
  })

  it("四级标题按三级处理，空文档没有块", () => {
    expect(parseMarkdown("#### 小标题")).toEqual([{ kind: "heading", level: 3, inline: [{ kind: "text", text: "小标题" }] }])
    expect(parseMarkdown("   \n\n")).toEqual([])
  })
})

describe("一句话简介", () => {
  it("取第一个段落、去掉格式并按长度截断", () => {
    expect(markdownSummary("## 档案\n\n把 **工程方法** 讲清楚。\n下一行。")).toBe("把 工程方法 讲清楚。 下一行。")
    expect(markdownSummary("## 只有标题")).toBe("")
    expect(markdownSummary("很长".repeat(50), 10)).toBe("很长很长很长很长很…")
  })
})
