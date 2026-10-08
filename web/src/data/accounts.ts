import type { Account, Platform, PlatformId } from "./types"

export const PLATFORMS: Record<PlatformId, Platform> = {
  blog: { id: "blog", name: "博客", glyph: "博", color: "green", interactions: ["comments"] },
  zhihu: { id: "zhihu", name: "知乎", glyph: "知", color: "blue", interactions: ["likes", "collects", "comments"] },
  bilibili: { id: "bilibili", name: "B站", glyph: "B", color: "pink", interactions: ["likes", "collects", "comments"] },
  xiaohongshu: { id: "xiaohongshu", name: "小红书", glyph: "红", color: "red", interactions: ["likes", "collects", "comments"] },
}

/** 侧栏和各页的账号顺序 */
export const ACCOUNTS: Account[] = [
  {
    id: "zhihu-yiye",
    platform: "zhihu",
    name: "一叶之桐",
    handle: "@一叶之桐",
    url: "https://www.zhihu.com/people/demo-yiye",
    stage: "active",
    since: "2025-11-01",
    audienceLabel: "关注者",
    readsLabel: "阅读",
    positioning: "把 AI 工程化和计算机里的一套方法、一个机制讲透的技术说明文。",
    audience: ["用 AI 写代码的工程师", "独立开发者", "想系统学 AI 工程化的学生"],
    columns: [
      { id: "ai-eng", name: "AI 工程化", targetShare: 0.4, color: "blue" },
      { id: "cs", name: "计算机", targetShare: 0.25, color: "teal" },
      { id: "econ", name: "经济管理", targetShare: 0.2, color: "amber" },
      { id: "cog", name: "认知科学与心理学", targetShare: 0.15, color: "violet" },
    ],
    styleRules: [
      "中性、准确、短，不装口语",
      "概念第一次出现，先用一句话下定义",
      "一件事一句话说完，删掉不少信息的句子就删",
      "每条规则配一句「不这么做会怎样」",
      "文件名、命令、判据直接写出来",
      "并列的信息做成表格",
    ],
    bannedPhrases: ["不是……而是……", "综上所述", "值得一提的是", "其实", "本质上", "让我们", "核心在于", "很多人……"],
    benchmarks: [
      { name: "代码与认知", platform: "zhihu", note: "说明文结构清楚，每节配一张对照表" },
      { name: "工程师的经济学", platform: "zhihu", note: "经济管理话题怎么落到工程决策上" },
      { name: "边缘计算笔记", platform: "web", note: "Cloudflare 实战的选题角度" },
    ],
    goals: { followers: 10_000, by: "2026-12-31", postsPerWeek: 2 },
    directionLog: [
      { date: "2026-09-20", note: "加入「认知科学与心理学」栏目，占比 15%" },
      { date: "2026-08-01", note: "改成长文为主，回答只挑浏览多、回答少的问题" },
    ],
    dataSource: {
      mode: "api",
      provider: "知乎数据开放平台",
      schedule: "每天 06:00",
      lastPullAt: "2026-10-08T06:00:12+08:00",
      lastResult: "ok",
    },
  },
  {
    id: "blog-chaosyn",
    platform: "blog",
    name: "技术博客",
    handle: "blog.chaosyn.com",
    url: "https://blog.chaosyn.com/",
    stage: "active",
    since: "2025-10-07",
    audienceLabel: "订阅",
    readsLabel: "访问",
    positioning: "长文沉淀：问题复盘、Cloudflare 与 AI 实战、开源项目。各平台的原稿都先写在这里。",
    audience: ["搜到具体报错的开发者", "用 Cloudflare 的个人站长", "关注独立开发的人"],
    columns: [
      { id: "postmortem", name: "问题复盘", targetShare: 0.35, color: "green" },
      { id: "cloudflare", name: "Cloudflare 实战", targetShare: 0.25, color: "orange" },
      { id: "ai", name: "AI", targetShare: 0.2, color: "blue" },
      { id: "oss", name: "开源项目", targetShare: 0.15, color: "indigo" },
      { id: "misc", name: "随笔", targetShare: 0.05, color: "gray" },
    ],
    styleRules: [
      "中英双语，两篇用同一个翻译键关联",
      "问题复盘按「现象 → 根因 → 修复 → 验证」写",
      "过博客门禁再提交",
      "站内链接写相对地址，改投时自动补成完整网址",
    ],
    bannedPhrases: ["不是……而是……", "综上所述", "值得一提的是"],
    benchmarks: [{ name: "Cloudflare 官方博客", platform: "web", note: "复盘文章的结构和配图" }],
    goals: { followers: 500, by: "2026-12-31", postsPerWeek: 2 },
    directionLog: [{ date: "2026-09-04", note: "新增「问题复盘」栏目，由博客复盘工具产出" }],
    dataSource: {
      mode: "analytics",
      provider: "Umami 网站统计",
      schedule: "每天 06:00",
      lastPullAt: "2026-10-08T06:00:20+08:00",
      lastResult: "failed",
      failReason: "统计接口返回 401",
      fixHint: "Umami 的 API 密钥可能过期了，到 Umami 后台重新生成，再填进配置。",
    },
  },
  {
    id: "bili-yiye",
    platform: "bilibili",
    name: "一叶之桐",
    handle: "UID 3546•••",
    url: "https://space.bilibili.com/",
    stage: "preparing",
    since: "2026-09-01",
    audienceLabel: "粉丝",
    readsLabel: "播放",
    positioning: "不露脸的技术教程：录屏讲操作，代码动画讲原理。",
    audience: ["想照着做的开发者", "Cloudflare 和 AI 工具新手"],
    columns: [
      { id: "tutorial", name: "录屏教程", targetShare: 0.7, color: "blue" },
      { id: "explainer", name: "60 秒讲一个机制", targetShare: 0.3, color: "teal" },
    ],
    styleRules: ["不露脸，只录屏和动画", "一条视频只讲一件事，10 分钟以内", "全程字幕，技术名词人工校对"],
    bannedPhrases: [],
    benchmarks: [{ name: "动画讲原理的科普区 UP 主", platform: "bilibili", note: "60 秒讲清一个机制的节奏" }],
    goals: { followers: 1_000, by: "2026-12-31", postsPerWeek: 1 },
    directionLog: [{ date: "2026-09-01", note: "开号，先做录屏教程，第一条选《Cloudflare Tunnel 实现 ssh 穿透》" }],
    dataSource: {
      mode: "manual",
      provider: "创作中心（没有个人数据接口）",
      schedule: "每周一手填",
      lastPullAt: "2026-09-28T21:12:00+08:00",
      lastResult: "ok",
    },
    prep: [
      { label: "开通账号，设好头像和简介", done: true },
      { label: "装好录屏和粗剪工具（OBS、auto-editor）", done: true },
      { label: "跑通字幕流程（VideoCaptioner）", done: true },
      { label: "做完第一条视频《Cloudflare Tunnel 实现 ssh 穿透》", done: false },
      { label: "登录投稿工具 biliup", done: false },
    ],
  },
  {
    id: "xhs-yiye",
    platform: "xiaohongshu",
    name: "一叶之桐",
    handle: "小红书号 待定",
    url: "https://www.xiaohongshu.com/",
    stage: "preparing",
    since: "2026-09-20",
    audienceLabel: "粉丝",
    readsLabel: "浏览",
    positioning: "把 AI 工具技巧做成 6 张图的卡片笔记。",
    audience: ["刚开始用 AI 工具的上班族", "学生"],
    columns: [{ id: "tips", name: "AI 工具技巧", targetShare: 1, color: "red" }],
    styleRules: ["标题 20 字以内", "正文 1000 字以内", "卡片 1080×1440，一篇 6 张以内", "每篇人工过一遍再发"],
    bannedPhrases: ["干货满满", "小伙伴们", "废话不多说"],
    benchmarks: [{ name: "AI 工具卡片类博主", platform: "xiaohongshu", note: "封面大字 + 一图一个要点" }],
    goals: { followers: 500, by: "2026-12-31", postsPerWeek: 2 },
    directionLog: [{ date: "2026-09-20", note: "开号，先用博客文章改卡片试两篇" }],
    dataSource: {
      mode: "manual",
      provider: "创作中心（没有个人数据接口）",
      schedule: "每周一手填",
      lastResult: "never",
    },
    prep: [
      { label: "开通账号", done: true },
      { label: "做好卡片模板（1080×1440）", done: false },
      { label: "先发两篇试试反应", done: false },
    ],
  },
]

export function accountById(id: string): Account {
  const account = ACCOUNTS.find((item) => item.id === id)
  if (!account) throw new Error(`没有这个账号：${id}`)
  return account
}

export function columnOf(accountId: string, columnId: string) {
  return accountById(accountId).columns.find((column) => column.id === columnId)
}
