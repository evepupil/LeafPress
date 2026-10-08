import type { Account, MetricDef, Platform, PlatformId } from "./types"

const metric = (key: string, label: string, interaction = true): MetricDef => ({ key, label, interaction })

/**
 * 四个平台。各平台作品的数据项不一样，照各自后台的叫法：
 * - 博客：Umami 统计的访问、访客，giscus（GitHub 讨论区）的评论
 * - 知乎：浏览、点赞、收藏、评论、分享
 * - B站：播放、点赞、投币、收藏、分享、弹幕、评论
 * - 小红书：浏览、点赞、收藏、评论、分享
 * 第一项是主数据，合计「浏览」时用它；标了互动的加起来是「互动」。
 */
export const PLATFORMS: Record<PlatformId, Platform> = {
  blog: {
    id: "blog",
    name: "博客",
    glyph: "博",
    color: "green",
    metrics: [metric("pageviews", "访问", false), metric("visitors", "访客", false), metric("comments", "评论")],
  },
  zhihu: {
    id: "zhihu",
    name: "知乎",
    glyph: "知",
    color: "blue",
    metrics: [
      metric("views", "浏览", false),
      metric("likes", "点赞"),
      metric("collects", "收藏"),
      metric("comments", "评论"),
      metric("shares", "分享"),
    ],
  },
  bilibili: {
    id: "bilibili",
    name: "B站",
    glyph: "B",
    color: "pink",
    metrics: [
      metric("views", "播放", false),
      metric("likes", "点赞"),
      metric("coins", "投币"),
      metric("collects", "收藏"),
      metric("shares", "分享"),
      metric("danmaku", "弹幕"),
      metric("comments", "评论"),
    ],
  },
  xiaohongshu: {
    id: "xiaohongshu",
    name: "小红书",
    glyph: "红",
    color: "red",
    metrics: [
      metric("views", "浏览", false),
      metric("likes", "点赞"),
      metric("collects", "收藏"),
      metric("comments", "评论"),
      metric("shares", "分享"),
    ],
  },
}

/** 账号档案的初始内容：原来分成几块的定位、写给谁、文风、禁用词、对标、调整记录，都写进一份 Markdown */
const ZHIHU_PROFILE = `## 定位

把 AI 工程化和计算机里的一套方法、一个机制讲透的技术说明文。

## 写给谁

- 用 AI 写代码的工程师
- 独立开发者
- 想系统学 AI 工程化的学生

## 写什么

AI 工程化为主，计算机原理次之；经济管理、认知科学与心理学偶尔写。

## 文风

- 中性、准确、短，不装口语
- 概念第一次出现，先用一句话下定义
- 一件事一句话说完，删掉不少信息的句子就删
- 每条规则配一句「不这么做会怎样」
- 文件名、命令、判据直接写出来
- 并列的信息做成表格

## 禁用词

不是……而是……、综上所述、值得一提的是、其实、本质上、让我们、核心在于、很多人……

## 对标

| 账号 | 学什么 |
|---|---|
| 代码与认知 | 说明文结构清楚，每节配一张对照表 |
| 工程师的经济学 | 经济管理话题怎么落到工程决策上 |
| 边缘计算笔记 | Cloudflare 实战的选题角度 |

## 调整记录

- 9 月 20 日：加入认知科学与心理学方向
- 8 月 1 日：改成长文为主，回答只挑浏览多、回答少的问题
`

const BLOG_PROFILE = `## 定位

长文沉淀：问题复盘、Cloudflare 与 AI 实战、开源项目。各平台的原稿都先写在这里。

## 写给谁

- 搜到具体报错的开发者
- 用 Cloudflare 的个人站长
- 关注独立开发的人

## 写法

- 中英双语，两篇用同一个翻译键关联
- 问题复盘按「现象 → 根因 → 修复 → 验证」写
- 过博客门禁再提交
- 站内链接写相对地址，改投时自动补成完整网址

## 禁用词

不是……而是……、综上所述、值得一提的是

## 仓库

\`C:\\code\\yeton-blog\`，推送后自动部署到 https://blog.chaosyn.com/ 。
`

const BILI_PROFILE = `## 定位

不露脸的技术教程：录屏讲操作，代码动画讲原理。

## 写给谁

- 想照着做的开发者
- Cloudflare 和 AI 工具新手

## 做法

- 不露脸，只录屏和动画
- 一条视频只讲一件事，10 分钟以内
- 全程字幕，技术名词人工校对

## 第一条

《Cloudflare Tunnel 实现 ssh 穿透》录屏版，正在校对字幕。
`

const XHS_PROFILE = `## 定位

把 AI 工具技巧做成 6 张图的卡片笔记。

## 写给谁

- 刚开始用 AI 工具的上班族
- 学生

## 做法

- 标题 20 字以内，正文 1000 字以内
- 卡片 1080×1440，一篇 6 张以内
- 每篇人工过一遍再发

## 禁用词

干货满满、小伙伴们、废话不多说
`

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
    readsLabel: "浏览",
    profile: ZHIHU_PROFILE,
    dataSource: {
      mode: "api",
      provider: "知乎数据开放平台",
      schedule: "每天 06:00",
      status: "ok",
      lastPullAt: "2026-10-08T06:00:12+08:00",
    },
    setup: [
      { key: "home", label: "主页", value: "https://www.zhihu.com/people/demo-yiye", status: "ok" },
      { key: "data-key", label: "数据开放平台密钥", secret: true, value: "configured", status: "ok", usedFor: "data" },
    ],
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
    profile: BLOG_PROFILE,
    dataSource: {
      mode: "analytics",
      provider: "Umami 网站统计",
      schedule: "每天 06:00",
      status: "failed",
      lastPullAt: "2026-10-08T06:00:20+08:00",
      failReason: "统计接口返回 401",
      fixHint: "Umami 的 API 密钥可能过期了，到 Umami 后台重新生成，再填进下面的配置。",
    },
    setup: [
      { key: "repo", label: "博客仓库", value: "C:\\code\\yeton-blog", status: "ok", usedFor: "write" },
      { key: "site", label: "站点", value: "https://blog.chaosyn.com/", status: "ok" },
      { key: "umami-key", label: "Umami API 密钥", secret: true, value: "configured", status: "expired", usedFor: "data" },
    ],
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
    profile: BILI_PROFILE,
    dataSource: {
      mode: "crawler",
      provider: "B站创作中心",
      schedule: "每天 06:00",
      status: "missing",
      plan: "登录创作中心后抓作品数据页，没有官方接口也能拿",
    },
    setup: [
      { key: "uid", label: "UID", value: "3546•••", status: "ok" },
      { key: "biliup", label: "投稿工具 biliup 登录", status: "missing", usedFor: "publish" },
      { key: "studio-login", label: "创作中心登录", status: "missing", usedFor: "data" },
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
    profile: XHS_PROFILE,
    dataSource: {
      mode: "crawler",
      provider: "小红书创作中心",
      schedule: "每天 06:00",
      status: "missing",
      plan: "登录创作服务平台后抓笔记数据页，没有官方接口也能拿",
    },
    setup: [
      { key: "xhs-id", label: "小红书号", status: "missing" },
      { key: "studio-login", label: "创作服务平台登录", status: "missing", usedFor: "data" },
    ],
  },
]

export function accountById(id: string): Account {
  const account = ACCOUNTS.find((item) => item.id === id)
  if (!account) throw new Error(`没有这个账号：${id}`)
  return account
}

/** 账号档案的文件位置：任何 agent 写稿前读它 */
export function profilePath(accountId: string): string {
  return `~/.leafpress/accounts/${accountId}.md`
}
