import type { PlatformId, ScheduledWorkflow, Tool, Workflow, WorkSource } from "./types"

/**
 * 工作流：一个作品从开始到发布要走的步骤。
 * 创建作品时按「平台 + 来源」自动配一个（见 pickWorkflow），之后可以在作品里换。
 * 标了 manual 的步骤要你动手：AI 走到这一步就把作品改成「等你处理」，把要你做的事写进任务文件夹。
 */
export const WORKFLOWS: Workflow[] = [
  {
    id: "blog-write",
    name: "博客写稿",
    platform: "blog",
    from: "idea",
    summary: "把灵感写成中英文博客文章，过博客门禁后提交，推送后自动发布。",
    steps: [
      { name: "整理素材", kind: "ai", tool: "CloudMind、开发记录", produces: ["素材.md"] },
      { name: "写中文稿", kind: "ai", tool: "博客问题复盘 skill", produces: ["zh.mdx"] },
      { name: "写英文稿", kind: "ai", tool: "博客问题复盘 skill", produces: ["en.mdx"] },
      { name: "跑博客门禁", kind: "code", tool: "博客仓库门禁", produces: ["门禁结果.txt"] },
      { name: "提交并推送", kind: "code", tool: "git" },
    ],
    autoPublish: true,
    status: "ready",
    say: "把这个灵感写成博客",
  },
  {
    id: "blog-to-zhihu",
    name: "博客转知乎",
    platform: "zhihu",
    from: "blog-work",
    summary: "读博客原稿，按知乎写法改写，补全链接、文末附原文，生成复制页；你去知乎投递，填回链接。",
    steps: [
      { name: "读原稿", kind: "code", tool: "博客仓库", produces: ["原稿.md"] },
      { name: "AI 改写", kind: "ai", tool: "知乎写作 skill", produces: ["改写稿.md"] },
      { name: "固定转换", kind: "code", tool: "流程图转图片、补全链接", produces: ["转换后.md"] },
      { name: "禁用句式自查", kind: "code", tool: "禁用句式检查", produces: ["自查.md"] },
      { name: "生成复制页", kind: "code", tool: "复制页", produces: ["复制页.html"] },
      {
        name: "你去知乎投递",
        kind: "manual",
        ask: "用浏览器打开 {folder}/复制页.html，点「复制正文」，到知乎「写文章」粘贴后发布。发布后把文章链接填在下面。",
      },
      { name: "归档链接", kind: "code", tool: "记录库" },
    ],
    autoPublish: false,
    status: "ready",
    say: "把这篇博客转成知乎文章",
  },
  {
    id: "zhihu-write",
    name: "知乎写作",
    platform: "zhihu",
    from: "idea",
    summary: "按一叶之桐的方向和文风写技术说明文：先出大纲给你确认，写完生成复制页，你去知乎投递。",
    steps: [
      { name: "出大纲", kind: "ai", tool: "知乎写作 skill", produces: ["大纲.md"] },
      {
        name: "你确认大纲",
        kind: "manual",
        ask: "打开 {folder}/大纲.md 看一遍。没问题就在下面写「可以」；要改就写要改哪里。",
      },
      { name: "写全文", kind: "ai", tool: "知乎写作 skill", produces: ["正文.md"] },
      { name: "交稿前自检", kind: "code", tool: "禁用句式检查", produces: ["自查.md"] },
      { name: "生成复制页", kind: "code", tool: "复制页", produces: ["复制页.html"] },
      {
        name: "你去知乎投递",
        kind: "manual",
        ask: "用浏览器打开 {folder}/复制页.html，点「复制正文」，到知乎「写文章」粘贴后发布。发布后把文章链接填在下面。",
      },
      { name: "归档链接", kind: "code", tool: "记录库" },
    ],
    autoPublish: false,
    status: "ready",
    say: "把这个灵感写成知乎文章",
  },
  {
    id: "blog-to-zhihu-answer",
    name: "博客转知乎回答",
    platform: "zhihu",
    from: "blog-work",
    summary: "找到和文章对得上的知乎问题让你挑，把开头改成回答这个问题的口吻，你去问题下投递。",
    steps: [
      { name: "找相关问题", kind: "code", tool: "知乎数据开放平台", produces: ["候选问题.md"] },
      {
        name: "你选问题",
        kind: "manual",
        ask: "打开 {folder}/候选问题.md，把要挂的问题编号写在下面。",
      },
      { name: "改写开头", kind: "ai", tool: "知乎写作 skill", produces: ["回答稿.md"] },
      { name: "生成复制页", kind: "code", tool: "复制页", produces: ["复制页.html"] },
      {
        name: "你去问题下投递",
        kind: "manual",
        ask: "用浏览器打开 {folder}/复制页.html，点「打开问题页」，在问题下写回答、粘贴正文后发布。发布后把回答链接填在下面。",
      },
      { name: "归档链接", kind: "code", tool: "记录库" },
    ],
    autoPublish: false,
    status: "needs-setup",
    setupHint: "找问题要用知乎数据开放平台的「问题推荐」接口，还没开通。",
    say: "把这篇博客挂到知乎问题下",
  },
  {
    id: "to-xhs-cards",
    name: "转小红书卡片",
    platform: "xiaohongshu",
    from: "any",
    summary: "从文章或灵感里提炼 6 个要点，排成 1080×1440 的卡片，配一段文案；你在手机上发。",
    steps: [
      { name: "提炼要点", kind: "ai", tool: "Claude", produces: ["要点.md"] },
      { name: "排版卡片", kind: "code", tool: "Edge 无头截图", produces: ["卡片/1.png … 6.png"] },
      { name: "写文案", kind: "ai", tool: "Claude", produces: ["文案.md"] },
      {
        name: "你在手机上发",
        kind: "manual",
        ask: "把 {folder}/卡片 里的 6 张图传到手机，配上 文案.md 的内容发小红书。发完把笔记链接填在下面。",
      },
      { name: "归档链接", kind: "code", tool: "记录库" },
    ],
    autoPublish: false,
    status: "ready",
    say: "把这篇做成小红书卡片",
  },
  {
    id: "video-pipeline",
    name: "录屏成片",
    platform: "bilibili",
    from: "any",
    summary: "不用 AI 视频模型：AI 写脚本，你录屏，自动剪掉空白、生成字幕，你校对后出横版和竖版。",
    steps: [
      { name: "写录屏脚本", kind: "ai", tool: "Claude", produces: ["脚本.md"] },
      {
        name: "你录屏",
        kind: "manual",
        ask: "照着 {folder}/脚本.md 录屏，录好放到 {folder}/录屏.mp4，然后在下面写「录好了」。",
      },
      { name: "剪掉没说话的片段", kind: "code", tool: "auto-editor", produces: ["粗剪.mp4"] },
      { name: "生成字幕", kind: "code", tool: "VideoCaptioner", produces: ["字幕.srt"] },
      {
        name: "你校对字幕",
        kind: "manual",
        ask: "打开 {folder}/字幕.srt，标了「?」的是 AI 拿不准的技术名词，改好保存后在下面写「改好了」。",
      },
      { name: "出横版和竖版", kind: "code", tool: "FFmpeg", produces: ["横版.mp4", "竖版.mp4"] },
      {
        name: "你上传到 B站",
        kind: "manual",
        ask: "打开 B站投稿页，上传 {folder}/横版.mp4，标题和简介在 {folder}/投稿信息.md。发布后把视频链接填在下面。",
      },
      { name: "归档链接", kind: "code", tool: "记录库" },
    ],
    autoPublish: false,
    status: "ready",
    say: "把这篇做成 B站视频",
  },
]

/** 定时工作流 */
export const SCHEDULED: ScheduledWorkflow[] = [
  {
    id: "idea-harvest",
    name: "跑灵感",
    summary: "扫开发记录、CloudMind 记忆和热点，挑出值得写的，放进灵感收件箱。",
    schedule: "每天 08:00",
    steps: ["扫开发记录", "读 CloudMind 记忆", "看热点", "写进灵感收件箱"],
    lastRunAt: "2026-10-08T08:00:00+08:00",
    lastResult: "ok",
    lastNote: "新增 3 条灵感",
  },
  {
    id: "data-pull",
    name: "拉作品数据",
    summary: "每天早上拉各账号前一天的数据；拿数据的工具还没做的平台先跳过。",
    schedule: "每天 06:00",
    steps: ["知乎接口", "博客统计", "存快照"],
    lastRunAt: "2026-10-08T06:00:00+08:00",
    lastResult: "failed",
    lastNote: "博客统计接口返回 401，其余已入库",
  },
  {
    id: "weekly-report",
    name: "周报",
    summary: "每周一早上汇总上周各账号的粉丝、作品和数据，写几句建议。",
    schedule: "每周一 08:00",
    steps: ["汇总数据", "挑出表现最好的作品", "写建议"],
    lastRunAt: "2026-10-05T08:00:00+08:00",
    lastResult: "ok",
    lastNote: "9月28日 – 10月4日 周报已生成",
  },
]

/** 工作流用到的工具 */
export const TOOLS: Tool[] = [
  { name: "知乎写作 skill", kind: "skill", note: "一叶之桐的文风规矩和禁用词", status: "ready" },
  { name: "博客问题复盘 skill", kind: "skill", note: "中英文复盘文章和元数据", status: "ready" },
  { name: "知乎官方发布 skill", kind: "skill", note: "发布凭证批下来后，知乎投递改成自动", status: "needs-setup" },
  { name: "复制页", kind: "code", note: "生成能直接粘贴进平台编辑器的页面", status: "ready" },
  { name: "禁用句式检查", kind: "code", note: "按规则文件标出可疑句子", status: "ready" },
  { name: "Edge 无头截图", kind: "code", note: "流程图转图片、卡片出图", status: "ready" },
  { name: "auto-editor", kind: "cli", note: "剪掉没说话的片段", status: "ready" },
  { name: "VideoCaptioner", kind: "cli", note: "转写、纠错、烧录字幕", status: "ready" },
  { name: "FFmpeg", kind: "cli", note: "一份素材出横版和竖版", status: "ready" },
  { name: "biliup", kind: "cli", note: "B站投稿，还没登录", status: "needs-setup" },
  { name: "知乎数据开放平台", kind: "api", note: "拉数据可用；找问题的「问题推荐」接口还没开通", status: "needs-setup" },
  { name: "Umami 统计", kind: "api", note: "博客访问、访客", status: "ready" },
  { name: "giscus 评论", kind: "api", note: "博客评论数，读 GitHub 讨论区", status: "ready" },
  { name: "创作中心抓取", kind: "code", note: "登录 B站、小红书创作中心后抓作品数据，还没做", status: "needs-setup" },
]

export function workflowById(id: string): Workflow {
  const workflow = WORKFLOWS.find((item) => item.id === id)
  if (!workflow) throw new Error(`没有这个工作流：${id}`)
  return workflow
}

/**
 * 按平台和来源自动配工作流：
 * - 博客：博客写稿
 * - 知乎：来源是博客作品 → 博客转知乎；其余 → 知乎写作
 * - 小红书：转小红书卡片
 * - B站：录屏成片
 */
export function pickWorkflow(platform: PlatformId, source: WorkSource, sourcePlatform?: PlatformId): Workflow {
  switch (platform) {
    case "blog":
      return workflowById("blog-write")
    case "zhihu":
      return workflowById(source.kind === "work" && sourcePlatform === "blog" ? "blog-to-zhihu" : "zhihu-write")
    case "xiaohongshu":
      return workflowById("to-xhs-cards")
    case "bilibili":
      return workflowById("video-pipeline")
  }
}

/** 某个平台能换用的工作流 */
export function workflowsFor(platform: PlatformId): Workflow[] {
  return WORKFLOWS.filter((workflow) => workflow.platform === platform)
}
