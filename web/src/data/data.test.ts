import { describe, expect, it } from "vitest"

import { ACCOUNTS, PLATFORMS, accountById } from "./accounts"
import { LATEST_DAY, SERIES_START, THIS_WEEK, TODAY, addDays, addMinutes, daysBetween, weekdayIndex } from "./clock"
import { HARVEST_POOL, IDEAS } from "./ideas"
import { ACCOUNT_DAILY, reachAndInteractions, workDaily } from "./series"
import { SCHEDULED, TOOLS, WORKFLOWS, pickWorkflow, workflowById } from "./workflows"
import { WORKS } from "./works"

function unique(ids: string[]) {
  return new Set(ids).size === ids.length
}

describe("演示数据自洽", () => {
  it("演示时刻是周四，本周从周一开始", () => {
    expect(weekdayIndex(TODAY)).toBe(3)
    expect(weekdayIndex(THIS_WEEK)).toBe(0)
    expect(addDays(TODAY, -1)).toBe(LATEST_DAY)
    expect(addMinutes("2026-10-08T23:59:00+08:00", 2)).toBe("2026-10-09T00:01:00+08:00")
  })

  it("所有编号不重复", () => {
    expect(unique(ACCOUNTS.map((item) => item.id))).toBe(true)
    expect(unique(WORKS.map((item) => item.id))).toBe(true)
    expect(unique(IDEAS.map((item) => item.id))).toBe(true)
    expect(unique(WORKFLOWS.map((item) => item.id))).toBe(true)
    expect(unique(SCHEDULED.map((item) => item.id))).toBe(true)
    expect(unique(TOOLS.map((item) => item.name))).toBe(true)
    expect(unique(HARVEST_POOL.map((item) => item.text))).toBe(true)
  })

  it("每个平台的数据项不重复，第一项是主数据（不算互动），至少有一项互动", () => {
    for (const platform of Object.values(PLATFORMS)) {
      expect(unique(platform.metrics.map((item) => item.key))).toBe(true)
      expect(platform.metrics[0].interaction).toBe(false)
      expect(platform.metrics.some((item) => item.interaction)).toBe(true)
    }
  })

  it("每个账号都有档案；要配的东西编号不重复；还没接数据的号写了打算怎么拿", () => {
    for (const account of ACCOUNTS) {
      expect(account.profile.trim().length).toBeGreaterThan(0)
      expect(unique(account.setup.map((item) => item.key))).toBe(true)
      if (account.dataSource.status === "missing") expect(account.dataSource.plan).toBeDefined()
      if (account.dataSource.status === "failed") expect(account.dataSource.failReason).toBeDefined()
    }
  })

  it("工作流：要你动手的步骤都写了要你做什么；不能自动发布的至少有一步要你动手", () => {
    for (const workflow of WORKFLOWS) {
      for (const step of workflow.steps) if (step.kind === "manual") expect(step.ask).toBeDefined()
      if (!workflow.autoPublish) expect(workflow.steps.some((step) => step.kind === "manual")).toBe(true)
      if (workflow.status === "needs-setup") expect(workflow.setupHint).toBeDefined()
    }
  })

  it("自动配工作流：博客写稿、博客转知乎、知乎写作、小红书卡片、录屏成片", () => {
    expect(pickWorkflow("blog", { kind: "idea", ideaId: "i-01" }).id).toBe("blog-write")
    expect(pickWorkflow("zhihu", { kind: "work", workId: "x" }, "blog").id).toBe("blog-to-zhihu")
    expect(pickWorkflow("zhihu", { kind: "idea", ideaId: "i-01" }).id).toBe("zhihu-write")
    expect(pickWorkflow("zhihu", { kind: "none" }).id).toBe("zhihu-write")
    expect(pickWorkflow("xiaohongshu", { kind: "idea", ideaId: "i-01" }).id).toBe("to-xhs-cards")
    expect(pickWorkflow("bilibili", { kind: "work", workId: "x" }, "blog").id).toBe("video-pipeline")
  })
})

describe("作品", () => {
  it("一个作品只对应一个账号：工作流属于这个平台；已发作品的数据项正好是这个平台的数据项", () => {
    for (const work of WORKS) {
      const account = accountById(work.accountId)
      expect(workflowById(work.workflowId).platform).toBe(account.platform)
      if (work.totals) expect(Object.keys(work.totals).sort()).toEqual(PLATFORMS[account.platform].metrics.map((item) => item.key).sort())
    }
  })

  it("状态和步骤对得上：已完成步骤记满且有链接和发布日期；等你处理停在要你动手的步骤上", () => {
    for (const work of WORKS) {
      const steps = workflowById(work.workflowId).steps
      if (work.status === "done") {
        expect(work.step).toBe(steps.length)
        expect(work.url).toBeDefined()
        expect(work.publishedAt).toBeDefined()
        expect(work.totals).toBeDefined()
      } else {
        expect(work.step).toBeLessThan(steps.length)
        expect(work.publishedAt).toBeUndefined()
        expect(work.totals).toBeUndefined()
      }
      if (work.status === "waiting") {
        expect(steps[work.step].kind).toBe("manual")
        expect(work.ask).toContain(`~/.leafpress/tasks/${work.id}`)
      } else {
        expect(work.ask).toBeUndefined()
      }
    }
  })

  it("来源指向存在的作品和灵感，灵感也记着转出去的作品", () => {
    const workIds = new Set(WORKS.map((work) => work.id))
    for (const work of WORKS) {
      if (work.source.kind === "work") expect(workIds.has(work.source.workId)).toBe(true)
      if (work.source.kind === "idea") {
        const ideaId = work.source.ideaId
        const idea = IDEAS.find((item) => item.id === ideaId)
        expect(idea?.workIds).toContain(work.id)
      }
    }
    for (const idea of IDEAS) {
      expect(idea.status === "converted").toBe(idea.workIds.length > 0)
      for (const id of idea.workIds) {
        const work = WORKS.find((item) => item.id === id)
        expect(work?.source).toEqual({ kind: "idea", ideaId: idea.id })
      }
    }
  })

  it("博客 39 篇中文文章都在：链接指向博客，原稿在博客仓库", () => {
    const blog = WORKS.filter((work) => work.source.kind === "import")
    expect(blog).toHaveLength(39)
    for (const work of blog) {
      expect(work.accountId).toBe("blog-chaosyn")
      expect(work.url?.startsWith("https://blog.chaosyn.com/posts/")).toBe(true)
      expect(work.localPath?.startsWith("C:\\code\\yeton-blog\\content\\posts\\zh\\")).toBe(true)
    }
    expect(blog.filter((work) => work.localPath?.endsWith(".md"))).toHaveLength(1)
  })
})

describe("每日数据", () => {
  it("接了数据的号从开号（最早 4 月 20 日）到昨天一天不缺，粉丝不为负；还没接的号没有数据", () => {
    for (const account of ACCOUNTS) {
      const points = ACCOUNT_DAILY[account.id]
      if (account.dataSource.status === "missing") {
        expect(points).toEqual([])
        continue
      }
      const start = account.since > SERIES_START ? account.since : SERIES_START
      expect(points.map((point) => point.day)).toEqual(daysBetween(start, LATEST_DAY))
      for (const point of points) expect(point.followers).toBeGreaterThanOrEqual(0)
    }
  })

  it("每个已发作品每天的主数据、互动加起来正好等于累计数", () => {
    for (const work of WORKS) {
      if (work.status !== "done" || !work.totals) continue
      const days = workDaily(work)
      const { reach, interactions } = reachAndInteractions(work)
      expect(days.reduce((sum, day) => sum + day.reads, 0)).toBe(reach)
      expect(days.reduce((sum, day) => sum + day.interactions, 0)).toBe(interactions)
      expect(days[0].day).toBe(work.publishedAt)
      expect(days.at(-1)?.day).toBe(LATEST_DAY)
    }
  })

  it("知乎每天的发布数等于当天发出的作品数", () => {
    const points = ACCOUNT_DAILY["zhihu-yiye"]
    const posts = points.reduce((sum, point) => sum + point.posts, 0)
    const expected = WORKS.filter(
      (work) => work.accountId === "zhihu-yiye" && work.status === "done" && work.publishedAt && work.publishedAt >= SERIES_START,
    ).length
    expect(posts).toBe(expected)
  })
})
