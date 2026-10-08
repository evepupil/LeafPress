import { describe, expect, it } from "vitest"

import { ACCOUNTS, accountById } from "./accounts"
import { LATEST_DAY, SERIES_START, THIS_WEEK, TODAY, addDays, daysBetween, weekdayIndex } from "./clock"
import { BOOKMARKS, DEV_MATERIALS, IDEAS } from "./ideas"
import { ACCOUNT_DAILY, pubDaily } from "./series"
import { RUNS, TOOLS } from "./tools"
import { PUBLICATIONS, WORKS } from "./works"

function unique(ids: string[]) {
  return new Set(ids).size === ids.length
}

describe("演示数据自洽", () => {
  it("演示时刻是周四，本周从周一开始", () => {
    expect(weekdayIndex(TODAY)).toBe(3)
    expect(weekdayIndex(THIS_WEEK)).toBe(0)
    expect(addDays(TODAY, -1)).toBe(LATEST_DAY)
  })

  it("所有编号不重复", () => {
    expect(unique(ACCOUNTS.map((item) => item.id))).toBe(true)
    expect(unique(WORKS.map((item) => item.id))).toBe(true)
    expect(unique(PUBLICATIONS.map((item) => item.id))).toBe(true)
    expect(unique(IDEAS.map((item) => item.id))).toBe(true)
    expect(unique(RUNS.map((item) => item.id))).toBe(true)
    expect(unique(TOOLS.map((item) => item.id))).toBe(true)
    expect(unique(DEV_MATERIALS.map((item) => item.id))).toBe(true)
    expect(unique(BOOKMARKS.map((item) => item.id))).toBe(true)
  })

  it("每个账号的栏目计划占比加起来是 1", () => {
    for (const account of ACCOUNTS) {
      const sum = account.columns.reduce((total, column) => total + column.targetShare, 0)
      expect(sum).toBeCloseTo(1, 6)
    }
  })

  it("版本指向存在的作品、账号和该账号的栏目；已发的才有数据和发布日期", () => {
    const workIds = new Set(WORKS.map((work) => work.id))
    for (const pub of PUBLICATIONS) {
      expect(workIds.has(pub.workId)).toBe(true)
      const account = accountById(pub.accountId)
      expect(account.columns.some((column) => column.id === pub.columnId)).toBe(true)
      if (pub.state === "published") {
        expect(pub.publishedAt).toBeDefined()
        expect(pub.totals).toBeDefined()
        expect(pub.url).toBeDefined()
      } else {
        expect(pub.totals).toBeUndefined()
        expect(pub.publishedAt).toBeUndefined()
      }
      if (pub.state === "scheduled" || pub.state === "pending-link") expect(pub.plannedFor).toBeDefined()
    }
  })

  it("作品状态和版本对得上：已发的作品至少有一个已发版本，其余一个都没有", () => {
    for (const work of WORKS) {
      const account = accountById(work.accountId)
      expect(account.columns.some((column) => column.id === work.columnId)).toBe(true)
      const published = PUBLICATIONS.filter((pub) => pub.workId === work.id && pub.state === "published")
      if (work.status === "published") expect(published.length).toBeGreaterThan(0)
      else expect(published.length).toBe(0)
    }
  })

  it("博客 39 篇中文文章都在，链接指向博客", () => {
    const blog = PUBLICATIONS.filter((pub) => pub.accountId === "blog-chaosyn" && pub.state === "published")
    expect(blog).toHaveLength(39)
    for (const pub of blog) expect(pub.url?.startsWith("https://blog.chaosyn.com/posts/")).toBe(true)
  })

  it("已转作品的灵感指向存在的作品，别的灵感没有作品", () => {
    const workIds = new Set(WORKS.map((work) => work.id))
    for (const idea of IDEAS) {
      if (idea.status === "converted") expect(workIds.has(idea.workId ?? "")).toBe(true)
      else expect(idea.workId).toBeUndefined()
    }
  })

  it("运行记录：等待中的有等什么和按钮，失败的有原因，完成的步骤全部完成", () => {
    const toolIds = new Set(TOOLS.map((tool) => tool.id))
    const workIds = new Set(WORKS.map((work) => work.id))
    for (const run of RUNS) {
      expect(toolIds.has(run.toolId)).toBe(true)
      if (run.workId) expect(workIds.has(run.workId)).toBe(true)
      if (run.state === "waiting") {
        expect(run.waitingFor).toBeDefined()
        expect(run.actionLabel).toBeDefined()
        expect(run.steps.filter((step) => step.state === "waiting")).toHaveLength(1)
      }
      if (run.state === "failed") {
        expect(run.error).toBeDefined()
        expect(run.steps.some((step) => step.state === "failed")).toBe(true)
      }
      if (run.state === "done") {
        expect(run.finishedAt).toBeDefined()
        expect(run.steps.every((step) => step.state === "done")).toBe(true)
      }
      if (run.state === "running") expect(run.steps.filter((step) => step.state === "running")).toHaveLength(1)
    }
    for (let i = 1; i < RUNS.length; i++) expect(RUNS[i - 1].startedAt >= RUNS[i].startedAt).toBe(true)
  })
})

describe("每日数据", () => {
  it("每个账号从开号（最早 4 月 20 日）到昨天一天不缺，粉丝不为负", () => {
    for (const account of ACCOUNTS) {
      const points = ACCOUNT_DAILY[account.id]
      const start = account.since > SERIES_START ? account.since : SERIES_START
      expect(points.map((point) => point.day)).toEqual(daysBetween(start, LATEST_DAY))
      for (const point of points) expect(point.followers).toBeGreaterThanOrEqual(0)
    }
  })

  it("每个已发版本每天的阅读加起来正好等于累计阅读", () => {
    for (const pub of PUBLICATIONS) {
      if (pub.state !== "published" || !pub.totals) continue
      const days = pubDaily(pub)
      expect(days.reduce((sum, day) => sum + day.reads, 0)).toBe(pub.totals.reads)
      expect(days.reduce((sum, day) => sum + day.interactions, 0)).toBe(pub.totals.likes + pub.totals.collects + pub.totals.comments)
      expect(days[0].day).toBe(pub.publishedAt)
      expect(days.at(-1)?.day).toBe(LATEST_DAY)
    }
  })

  it("知乎每天的发布数等于当天发出的版本数", () => {
    const points = ACCOUNT_DAILY["zhihu-yiye"]
    const posts = points.reduce((sum, point) => sum + point.posts, 0)
    const expected = PUBLICATIONS.filter(
      (pub) => pub.accountId === "zhihu-yiye" && pub.state === "published" && pub.publishedAt && pub.publishedAt >= SERIES_START,
    ).length
    expect(posts).toBe(expected)
  })
})
