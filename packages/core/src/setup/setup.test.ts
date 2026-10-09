import { afterEach, describe, expect, it } from "vitest"
import { PLATFORMS } from "../catalog/index.ts"
import { WORKFLOWS } from "../catalog/workflows.ts"
import type { Account, PlatformInfo, WorkflowDef } from "../types/index.ts"
import { makeAccount } from "../metrics/test-fixtures.ts"
import { pullNote, pullPlan } from "./pull.ts"
import { dataSourceView, setupItems, setupView, settingViews } from "./setup.ts"

const samplePlatform: PlatformInfo = {
  ...PLATFORMS.zhihu,
  setupItems: [
    { key: "handle", label: "账号名", secret: false, usedFor: "write" },
    { key: "token", label: "访问密钥", secret: true, usedFor: "data" },
    { key: "expired", label: "发布令牌", secret: true, usedFor: "publish" },
  ],
}

const originalWorkflows = [...WORKFLOWS]
afterEach(() => WORKFLOWS.splice(0, WORKFLOWS.length, ...originalWorkflows))

function accountWithSettings(settings: Account["settings"] = []): Account {
  return makeAccount("zhihu-1", "zhihu", { settings })
}

describe("接入状态", () => {
  it("普通项、密钥和过期状态按平台顺序生成，过期覆盖已配置", () => {
    expect(
      settingViews(samplePlatform, {
        values: { handle: "  user  " },
        secrets: new Set(["token"]),
        expired: { expired: "平台返回 401" },
      }),
    ).toEqual([
      { key: "handle", status: "ok", value: "user" },
      { key: "token", status: "ok" },
      { key: "expired", status: "expired", reason: "平台返回 401" },
    ])
    expect(settingViews(samplePlatform, { values: { handle: " " }, secrets: new Set(), expired: {} }).map((item) => item.status)).toEqual([
      "missing",
      "missing",
      "missing",
    ])
    expect(setupItems(samplePlatform, [{ key: "token", status: "ok", value: "must-not-leak" }]).map((item) => item.key)).toEqual([
      "handle",
      "token",
      "expired",
    ])
    expect(setupItems(samplePlatform, [{ key: "token", status: "ok", value: "must-not-leak" }])[1]).not.toHaveProperty("value")
  })

  it("真实目录里知乎已接：密钥没配时未完成，拉取失败时损坏", () => {
    const account = accountWithSettings()
    const unfinished = setupView(account, PLATFORMS.zhihu, {})
    expect(unfinished.state).toBe("unfinished")
    expect(unfinished.gaps).toEqual(["开放平台密钥未配置"])
    expect(unfinished.source.provider).toBe("知乎开放平台")

    const failure = setupView(
      account,
      { ...PLATFORMS.zhihu, dataTool: { mode: "api", provider: "平台接口" } },
      {
        pull: { accountId: account.id, at: "2026-10-08T09:00:00+08:00", status: "failed", reason: "接口返回 401", fixHint: "检查授权" },
      },
    )
    expect(failure.state).toBe("broken")
    expect(failure.gaps).toEqual(["数据拉取失败：接口返回 401", "开放平台密钥未配置"])
    expect(failure.source.fixHint).toBe("检查授权")

    const expired = setupView(makeAccount("expired", "zhihu", { settings: [{ key: "handle", status: "expired" }] }), samplePlatform, {})
    expect(expired.state).toBe("broken")
    // 样例平台照抄知乎，知乎已有拿数据的工具，所以缺项里没有「工具还没做」
    expect(expired.gaps).toEqual(["账号名已过期", "访问密钥未配置", "发布令牌未配置"])
  })

  it("专用工作流按 requires 检查可用性并逐字列出缺项", () => {
    const workflow: WorkflowDef = {
      id: "zhihu-special",
      name: "知乎专用流程",
      platform: "zhihu",
      from: "any",
      summary: "",
      steps: [],
      say: "",
      requires: ["expired"],
    }
    WORKFLOWS.unshift(workflow)
    const platform: PlatformInfo = {
      ...samplePlatform,
      dataTool: { mode: "api", provider: "知乎接口" },
      setupItems: [samplePlatform.setupItems[2]!],
    }
    const missing = setupView(accountWithSettings([{ key: "expired", status: "missing" }]), platform, {})
    expect(missing.hasPlatformWorkflow).toBe(true)
    expect(missing.state).toBe("unfinished")
    // 知乎三条专用工作流什么都不用配，始终能用；自造的「知乎专用流程」要发布令牌，没配上
    expect(missing.usableWorkflows.map((item) => item.id)).toEqual(["zhihu-answer", "zhihu-from-blog", "zhihu-article", "general-write"])
    expect(missing.gaps).toEqual(["「知乎专用流程」要先配：发布令牌", "发布令牌未配置"])

    const ready = setupView(accountWithSettings([{ key: "expired", status: "ok" }]), platform, {})
    expect(ready.state).toBe("ready")
    expect(ready.usableWorkflows.map((item) => item.id)).toEqual([
      "zhihu-special",
      "zhihu-answer",
      "zhihu-from-blog",
      "zhihu-article",
      "general-write",
    ])
    expect(ready.gaps).toEqual([])

    WORKFLOWS.splice(WORKFLOWS.indexOf(workflow), 1)
    const configOnlyWorkflow: WorkflowDef = { ...workflow, id: "zhihu-config-only", name: "配置独立流程", requires: [] }
    WORKFLOWS.unshift(configOnlyWorkflow)
    const configOnlyPlatform: PlatformInfo = {
      ...samplePlatform,
      dataTool: { mode: "api", provider: "知乎接口" },
      setupItems: [samplePlatform.setupItems[0]!],
    }
    const configOnly = setupView(accountWithSettings(), configOnlyPlatform, {})
    expect(configOnly.state).toBe("unfinished")
    expect(configOnly.usableWorkflows.map((item) => item.id)).toEqual([
      "zhihu-config-only",
      "zhihu-answer",
      "zhihu-from-blog",
      "zhihu-article",
      "general-write",
    ])
    expect(configOnly.gaps).toEqual(["账号名未配置"])

    WORKFLOWS.splice(WORKFLOWS.indexOf(configOnlyWorkflow), 1)
    WORKFLOWS.unshift({ ...configOnlyWorkflow, id: "zhihu-unusable-only", requires: ["unlisted-setting"] })
    const noItemsPlatform: PlatformInfo = { ...configOnlyPlatform, setupItems: [] }
    const unusableOnly = setupView(accountWithSettings(), noItemsPlatform, {})
    // 知乎三条专用工作流什么都不用配，自造的这条用不了也拦不住接入状态变就绪
    expect(unusableOnly.state).toBe("ready")
    expect(unusableOnly.items).toEqual([])
    expect(unusableOnly.gaps).toEqual(["「配置独立流程」要先配：unlisted-setting"])
  })

  it("数据来源没有工具、正常拉取与失败拉取分支", () => {
    // 没有拿数据工具的平台：不依赖哪个真实平台还没接
    const withoutTool: PlatformInfo = { ...PLATFORMS.zhihu }
    delete withoutTool.dataTool
    expect(dataSourceView(withoutTool, undefined, "每天 06:00")).toEqual({ status: "missing", schedule: "每天 06:00" })
    // 博客用 Umami 统计拿数据
    expect(dataSourceView(PLATFORMS.blog, undefined, "每天 06:00")).toEqual({
      status: "ok",
      mode: "analytics",
      provider: "Umami 统计",
      schedule: "每天 06:00",
    })
    expect(
      dataSourceView(
        { ...PLATFORMS.zhihu, dataTool: { mode: "api", provider: "知乎接口" } },
        {
          accountId: "zhihu-1",
          at: "2026-10-08T09:00:00+08:00",
          status: "ok",
        },
      ),
    ).toMatchObject({ status: "ok", lastPullAt: "2026-10-08T09:00:00+08:00", provider: "知乎接口" })
    expect(dataSourceView({ ...PLATFORMS.zhihu, dataTool: { mode: "api", provider: "知乎接口" } }, undefined)).toMatchObject({
      status: "ok",
      mode: "api",
      provider: "知乎接口",
    })
    expect(dataSourceView({ ...PLATFORMS.zhihu, dataTool: { mode: "api", provider: "知乎接口" } }, undefined)).not.toHaveProperty(
      "lastPullAt",
    )
  })
})

describe("拉取计划和提示", () => {
  const dataPlatform: PlatformInfo = {
    ...PLATFORMS.zhihu,
    dataTool: { mode: "api", provider: "知乎接口" },
    setupItems: [
      { key: "data-token", label: "数据令牌", secret: true, usedFor: "data" },
      { key: "secondary-token", label: "备用数据令牌", secret: true, usedFor: "data" },
      { key: "publish-key", label: "发布密钥", secret: true, usedFor: "publish" },
    ],
  }
  const catalog = { ...PLATFORMS, zhihu: dataPlatform }

  it("平台未接入时跳过，拉取配置按第一个不正常项阻止", () => {
    expect(
      pullPlan(
        [
          makeAccount("skip", "bilibili"),
          makeAccount("blog-account", "blog", { settings: [{ key: "site-url", status: "ok", value: "https://blog.example.test" }] }),
          accountWithSettings([{ key: "data-token", status: "missing" }]),
          makeAccount("expired", "zhihu", { settings: [{ key: "data-token", status: "expired" }] }),
          makeAccount("two-blocked", "zhihu", {
            settings: [
              { key: "secondary-token", status: "expired" },
              { key: "data-token", status: "missing" },
            ],
          }),
          makeAccount("ready", "zhihu", {
            settings: [
              { key: "data-token", status: "ok" },
              { key: "secondary-token", status: "ok" },
              { key: "publish-key", status: "missing" },
            ],
          }),
        ],
        catalog,
      ),
    ).toEqual([
      { accountId: "skip", action: "skip" },
      // 博客的拿数据只看 Umami 共享链接；站点地址是发布用的，不拦拉数据
      { accountId: "blog-account", action: "blocked", reason: "Umami 共享链接未配置" },
      { accountId: "zhihu-1", action: "blocked", reason: "数据令牌未配置" },
      { accountId: "expired", action: "blocked", reason: "数据令牌已过期" },
      { accountId: "two-blocked", action: "blocked", reason: "数据令牌未配置" },
      { accountId: "ready", action: "pull" },
    ])
  })

  it("没有结果、全成功、全失败和部分失败提示", () => {
    const accounts = [makeAccount("a", "zhihu", { name: "知乎号" }), makeAccount("b", "blog", { name: "博客号" })]
    expect(pullNote([], accounts)).toBe("没有能拉的账号")
    expect(pullNote([{ accountId: "a", status: "ok" }], accounts)).toBe("全部入库")
    expect(pullNote([{ accountId: "a", status: "failed", reason: "令牌过期" }], accounts)).toBe("知乎号：令牌过期")
    expect(
      pullNote(
        [
          { accountId: "a", status: "failed", reason: "令牌过期" },
          { accountId: "b", status: "ok" },
        ],
        accounts,
      ),
    ).toBe("知乎号：令牌过期，其余已入库")
    expect(
      pullNote(
        [
          { accountId: "a", status: "failed", reason: "令牌过期" },
          { accountId: "b", status: "failed", reason: "接口超时" },
          { accountId: "c", status: "ok" },
        ],
        accounts,
      ),
    ).toBe("知乎号：令牌过期；博客号：接口超时，其余已入库")
    expect(pullNote([{ accountId: "missing-account", status: "failed" }], accounts)).toBe("missing-account：未知原因")
  })
})
