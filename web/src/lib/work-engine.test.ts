import { describe, expect, it } from "vitest"

import { DEMO_NOW, addMinutes } from "@/data/clock"
import { IDEAS } from "@/data/ideas"
import type { Work } from "@/data/types"
import { WORKS, workById } from "@/data/works"
import {
  GENERIC_ASK,
  advance,
  convert,
  defaultBrief,
  extractUrl,
  moveTo,
  pickNext,
  progressText,
  stepState,
  submitFeedback,
  taskContext,
  taskFiles,
  waitingLabel,
  workflowForConvert,
} from "./work-engine"

const at = (minutes: number) => addMinutes(DEMO_NOW, minutes)

/** 一直让 AI 往下走，直到停下（等你处理或做完），最多 20 步 */
function runUntilStop(work: Work, start = 1): Work {
  let current = work
  for (let i = 0; i < 20; i++) {
    const next = advance(current, at(start + i))
    if (next === current) return current
    current = next
    if (current.status === "waiting" || current.status === "done") return current
  }
  return current
}

describe("博客转知乎：AI 做到投递就停，你反馈链接后归档", () => {
  it("从待实现一路走到「你去知乎投递」", () => {
    const jev = workById("z-jev")
    expect(jev.status).toBe("todo")
    const started = advance(jev, at(1))
    expect(started.status).toBe("doing")
    expect(started.step).toBe(0)
    const waiting = runUntilStop(started, 2)
    expect(waiting.status).toBe("waiting")
    expect(waiting.step).toBe(5)
    expect(waiting.ask).toContain("~/.leafpress/tasks/z-jev/复制页.html")
    expect(progressText(waiting)).toBe("第 6/7 步 · 你去知乎投递")
    expect(advance(waiting, at(30))).toBe(waiting)
  })

  it("反馈里带链接：回到待实现最前面，AI 接手后归档链接、标记完成", () => {
    const waiting = runUntilStop(advance(workById("z-jev"), at(1)), 2)
    const back = submitFeedback(waiting, "发布了，链接是 https://zhuanlan.zhihu.com/p/1987。", at(40), -3)
    expect(back.status).toBe("todo")
    expect(back.order).toBe(-3)
    expect(back.feedback).toBe("发布了，链接是 https://zhuanlan.zhihu.com/p/1987。")
    expect(back.ask).toBeUndefined()
    const resumed = advance(back, at(41))
    expect(resumed.status).toBe("doing")
    expect(resumed.step).toBe(6)
    const done = advance(resumed, at(42))
    expect(done.status).toBe("done")
    expect(done.step).toBe(7)
    expect(done.url).toBe("https://zhuanlan.zhihu.com/p/1987")
    expect(done.publishedAt).toBe("2026-10-08")
    expect(done.log.at(-1)?.text).toBe("已发布，链接已归档：https://zhuanlan.zhihu.com/p/1987")
  })

  it("空反馈不算数，不是等你处理的作品也不能反馈", () => {
    const waiting = workById("z-design-extraction")
    expect(submitFeedback(waiting, "   ", at(1), 0)).toBe(waiting)
    const todo = workById("z-jev")
    expect(submitFeedback(todo, "好了", at(1), 0)).toBe(todo)
  })
})

describe("别的工作流", () => {
  it("博客写稿全自动：一路做完，直接拿到博客链接", () => {
    const done = runUntilStop(workById("b-tunnel-access"))
    expect(done.status).toBe("done")
    expect(done.url).toBe("https://blog.chaosyn.com/posts/b-tunnel-access/")
    expect(done.log.some((item) => item.text.startsWith("等你"))).toBe(false)
  })

  it("知乎写作停两次：先确认大纲，再去投递", () => {
    const outline = runUntilStop(workById("z-fleet-truncation"))
    expect(outline.status).toBe("waiting")
    expect(outline.step).toBe(1)
    expect(outline.ask).toContain("~/.leafpress/tasks/z-fleet-truncation/大纲.md")
    const publish = runUntilStop(submitFeedback(outline, "可以", at(50), 0), 51)
    expect(publish.status).toBe("waiting")
    expect(publish.step).toBe(5)
    expect(publish.feedback).toBeUndefined()
    const done = runUntilStop(submitFeedback(publish, "发了 https://zhuanlan.zhihu.com/p/2024", at(80), 0), 81)
    expect(done.status).toBe("done")
    expect(done.url).toBe("https://zhuanlan.zhihu.com/p/2024")
  })

  it("要你动手的那一步没反馈就挪回待实现，AI 接手时直接停回等你处理", () => {
    const waiting = workById("z-design-extraction")
    const back = moveTo(waiting, "todo", at(1), 9)
    expect(back.status).toBe("todo")
    expect(back.order).toBe(9)
    const again = advance(back, at(2))
    expect(again.status).toBe("waiting")
    expect(again.step).toBe(5)
  })
})

describe("手动挪列", () => {
  it("挪到等你处理：AI 步骤给通用的一句，卡片上写「你来看一下」", () => {
    const moved = moveTo(workById("z-hourly-rate"), "waiting", at(1), 4)
    expect(moved.status).toBe("waiting")
    expect(moved.ask).toBe(GENERIC_ASK)
    expect(moved.log.at(-1)?.text).toBe("你把它挪到了「等你处理」")
    expect(waitingLabel(moved)).toBe("你来看一下")
    expect(waitingLabel(workById("z-design-extraction"))).toBe("你去知乎投递")
  })

  it("挪到已完成：步骤记满，链接从反馈里取；已完成的挪不出来", () => {
    const waiting = submitFeedback(workById("z-design-extraction"), "发好了 https://zhuanlan.zhihu.com/p/77", at(1), 0)
    const done = moveTo(waiting, "done", at(2), 0)
    expect(done.status).toBe("done")
    expect(done.step).toBe(7)
    expect(done.url).toBe("https://zhuanlan.zhihu.com/p/77")
    expect(moveTo(done, "todo", at(3), 1)).toBe(done)
  })
})

describe("挑任务、步骤、任务文件夹", () => {
  it("AI 挑待实现里排最前的，跳过要配置的工作流", () => {
    expect(pickNext(WORKS)?.id).toBe("b-tunnel-access")
    const blocked: Work = { ...workById("z-jev"), id: "z-blocked", order: 0, workflowId: "blog-to-zhihu-answer" }
    expect(pickNext([...WORKS, blocked])?.id).toBe("b-tunnel-access")
  })

  it("步骤状态", () => {
    const work = workById("z-design-extraction")
    expect(stepState(work, 4)).toBe("done")
    expect(stepState(work, 5)).toBe("waiting")
    expect(stepState(work, 6)).toBe("pending")
    expect(stepState(workById("z-reasoning"), 1)).toBe("running")
    expect(progressText(workById("z-chatgpt-mcp"))).toBe("7/7 步")
  })

  it("任务文件夹：做过的步骤留下的文件、要你做的事、你的反馈", () => {
    expect(taskFiles(workById("z-design-extraction"))).toEqual([
      "作品.md",
      "状态.json",
      "原稿.md",
      "改写稿.md",
      "转换后.md",
      "自查.md",
      "复制页.html",
      "要你做的事.md",
      "记录.log",
    ])
    expect(taskFiles(workById("z-jev"))).toEqual(["作品.md", "状态.json", "记录.log"])
  })

  it("取链接：中文标点前截断", () => {
    expect(extractUrl("发布了，链接是：https://zhuanlan.zhihu.com/p/1，谢谢")).toBe("https://zhuanlan.zhihu.com/p/1")
    expect(extractUrl("发好了")).toBeUndefined()
  })
})

describe("转作品", () => {
  it("一条灵感选两个平台 → 两个作品，各配各的工作流", () => {
    const idea = IDEAS.find((item) => item.id === "i-01")
    if (!idea) throw new Error("缺灵感 i-01")
    const works = convert(
      { kind: "idea", idea },
      ["zhihu-yiye", "blog-chaosyn"],
      defaultBrief({ kind: "idea", idea }),
      at(1),
      ["z-101", "b-102"],
      7,
    )
    expect(works.map((work) => [work.id, work.accountId, work.workflowId, work.order])).toEqual([
      ["z-101", "zhihu-yiye", "zhihu-write", 7],
      ["b-102", "blog-chaosyn", "blog-write", 8],
    ])
    expect(works.every((work) => work.status === "todo" && work.step === 0 && work.title === idea.text)).toBe(true)
    expect(works[0].source).toEqual({ kind: "idea", ideaId: "i-01" })
    expect(works[0].brief).toBe(idea.detail)
  })

  it("博客作品转知乎用博客转知乎；栏目对不上时用第一个栏目", () => {
    const blog = workById("chatgpt-mcp-3a94342e")
    expect(workflowForConvert({ kind: "work", work: blog }, "zhihu-yiye").workflow.id).toBe("blog-to-zhihu")
    expect(workflowForConvert({ kind: "work", work: blog }, "xhs-yiye").workflow.id).toBe("to-xhs-cards")
    expect(workflowForConvert({ kind: "work", work: blog }, "bili-yiye").workflow.id).toBe("video-pipeline")
    const [zhihu] = convert({ kind: "work", work: blog }, ["zhihu-yiye"], "", at(1), ["z-103"], 1)
    expect(zhihu.columnId).toBe("ai-eng")
    expect(zhihu.source).toEqual({ kind: "work", workId: "chatgpt-mcp-3a94342e" })
    expect(zhihu.log[0].text).toBe("创建，由《ChatGPT 网页版接入自建MCP》转来，用「博客转知乎」工作流")
  })

  it("直接新建：没有来源，知乎用知乎写作", () => {
    const [work] = convert({ kind: "new", title: "  新选题  " }, ["zhihu-yiye"], "写清楚", at(1), ["z-104"], 1)
    expect(work.title).toBe("新选题")
    expect(work.source).toEqual({ kind: "none" })
    expect(work.workflowId).toBe("zhihu-write")
  })
})

describe("复制给 AI 的任务说明", () => {
  it("写清平台、状态、工作流、任务文件夹、来源和步骤", () => {
    const work = workById("z-design-extraction")
    const text = taskContext(work, {
      title: "只凭一份设计提炼做 SaaS 后台",
      url: "https://blog.chaosyn.com/posts/design-extraction-saas-dashboard/",
    })
    const lines = text.split("\n")
    expect(lines[0]).toBe("# 作品 z-design-extraction：只凭一份设计提炼做 SaaS 后台：把规则锁进主题，把看板骨架搬到新业务")
    expect(lines).toContain("- 平台：知乎 · 一叶之桐（栏目：AI 工程化）")
    expect(lines).toContain("- 状态：等你处理（第 6/7 步 · 你去知乎投递）")
    expect(lines).toContain("- 工作流：博客转知乎")
    expect(lines).toContain("- 任务文件夹：~/.leafpress/tasks/z-design-extraction")
    expect(lines).toContain("- 来源：《只凭一份设计提炼做 SaaS 后台》（https://blog.chaosyn.com/posts/design-extraction-saas-dashboard/）")
    expect(lines).toContain("[x] 5. 生成复制页（自动）")
    expect(lines).toContain("[>] 6. 你去知乎投递（你来）")
    expect(lines).toContain("[ ] 7. 归档链接（自动）")
    expect(lines).toContain("## 等作者做的事")
  })
})
