import { describe, expect, it } from "vitest"

import { ACCOUNTS, accountById } from "@/data/accounts"
import { TODAY } from "@/data/clock"
import { SAVE_LOG_NOTE, applyDraft, docOf, draftOf, splitLines, splitList } from "./direction-draft"

describe("方向档案：文字和列表互转", () => {
  it("写给谁、禁用句式按「、」「,」「，」拆开，去空白、去空项", () => {
    expect(splitList(" 独立开发者、 学生 ,产品经理，，  ")).toEqual(["独立开发者", "学生", "产品经理"])
    expect(splitList("   ")).toEqual([])
  })

  it("文风规矩一行一条，去空行", () => {
    expect(splitLines("第一条\r\n\n  第二条  \n")).toEqual(["第一条", "第二条"])
    expect(splitLines("")).toEqual([])
  })

  it("进入编辑：列表连成文字", () => {
    const draft = draftOf(docOf(accountById("zhihu-yiye")))
    expect(draft.audience).toBe("用 AI 写代码的工程师、独立开发者、想系统学 AI 工程化的学生")
    expect(draft.styleRules.split("\n")).toHaveLength(6)
    expect(draft.bannedPhrases.split("、")).toHaveLength(8)
  })

  it("每个账号不改动直接保存，内容原样保留", () => {
    for (const account of ACCOUNTS) {
      const doc = docOf(account)
      const saved = applyDraft(doc, draftOf(doc), TODAY)
      expect(saved.positioning).toBe(doc.positioning)
      expect(saved.audience).toEqual(doc.audience)
      expect(saved.styleRules).toEqual(doc.styleRules)
      expect(saved.bannedPhrases).toEqual(doc.bannedPhrases)
    }
  })
})

describe("方向档案：保存", () => {
  it("改了定位，调整记录最前面多一条，原有记录顺延", () => {
    const doc = docOf(accountById("zhihu-yiye"))
    const saved = applyDraft(doc, { ...draftOf(doc), positioning: " 测试定位 " }, TODAY)
    expect(saved.positioning).toBe("测试定位")
    expect(saved.log).toHaveLength(doc.log.length + 1)
    expect(saved.log[0]).toEqual({ date: TODAY, note: SAVE_LOG_NOTE })
    expect(saved.log.slice(1)).toEqual(doc.log)
  })

  it("清空禁用句式后保存，列表为空", () => {
    const doc = docOf(accountById("zhihu-yiye"))
    const saved = applyDraft(doc, { ...draftOf(doc), bannedPhrases: "" }, TODAY)
    expect(saved.bannedPhrases).toEqual([])
  })

  it("编辑不会改到账号里的原始数据", () => {
    const account = accountById("zhihu-yiye")
    const before = account.directionLog.length
    const doc = docOf(account)
    applyDraft(doc, { ...draftOf(doc), audience: "只剩一个" }, TODAY)
    doc.audience.push("多出来的")
    expect(account.directionLog).toHaveLength(before)
    expect(account.audience).toHaveLength(3)
  })
})
