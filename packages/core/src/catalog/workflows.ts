import type { WorkflowDef } from "../types/index.ts"

/**
 * 发布工作流的定义：一个作品从开始到发布要走的步骤。这里是定义的唯一来源。
 * 代码步骤的实现在 src/platforms/<平台>/（通用工作流在 src/platforms/general/），按「工作流编号 + 步骤编号」登记。
 * 接一个平台时在这里加它专用的工作流（放在通用写稿前面）；自动配按平台和 from 挑，不用另写规则。
 */

/** 通用写稿：任何平台都能用；平台还没有专用工作流时自动配它 */
export const GENERAL_WRITE: WorkflowDef = {
  id: "general-write",
  name: "通用写稿",
  platform: "any",
  from: "any",
  summary: "AI 按要求和账号档案写稿，你去平台发布，回来贴上链接。",
  steps: [
    {
      id: "draft",
      name: "写稿",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["稿子.md"],
      instructions:
        "先整份读账号档案和要求；有来源的先读来源。按{platform}的写法写成 Markdown，存到 {folder}/稿子.md。" +
        "作者的反馈里要改的地方，照着改完再交。",
    },
    {
      id: "publish",
      name: "你去发布",
      kind: "manual",
      ask: "打开 {folder}/稿子.md 看一遍，没问题就发到{platform}（{account}），发完把链接填在下面；要改就写要改哪里。",
    },
    { id: "archive", name: "归档链接", kind: "code", tool: "记录库" },
  ],
  say: "按通用写稿做一下这个作品",
  requires: [],
}

export const BLOG_WRITE: WorkflowDef = {
  id: "blog-write",
  name: "博客写稿",
  platform: "blog",
  from: "any",
  summary: "AI 写中英文两篇，过了博客的检查就提交推送，上线后归档链接。",
  steps: [
    {
      id: "collect",
      name: "整理素材",
      kind: "ai",
      tool: "CloudMind、开发记录",
      produces: ["素材.md"],
      instructions: "按要求把要写的事实、代码片段、链接、截图整理进 {folder}/素材.md；来源是灵感或作品的先读来源。",
    },
    {
      id: "draft-zh",
      name: "写中文稿",
      kind: "ai",
      tool: "博客问题复盘 skill",
      produces: ["中文稿.mdx", "slug.txt"],
      instructions:
        "按账号档案和博客现有文章的写法写中文稿，存到 {folder}/中文稿.mdx；slug（小写英文和数字，用 - 连接，不能和已有文章、已有译文配对键撞）单独写进 {folder}/slug.txt。" +
        'frontmatter 照这个样子写：title: "…"、description: "…"（240 字以内）、published: "YYYY-MM-DD"（今天，带引号）、locale: "zh-CN"、tags: ["…"]（至少一个）、translationKey: "<slug>"、draft: false。' +
        "问题复盘类文章照「博客问题复盘」skill 的结构写，只借结构，不要运行它的提交、推送（后面的步骤会做）。图片放 {folder}/images/，正文里写成 /images/posts/<slug>/<文件名>。",
    },
    {
      id: "draft-en",
      name: "写英文稿",
      kind: "ai",
      tool: "博客问题复盘 skill",
      produces: ["英文稿.mdx"],
      instructions:
        '把中文稿写成英文版，存到 {folder}/英文稿.mdx：locale: "en"，translationKey、published 和中文稿相同，draft: false，其余字段照中文稿的规矩。',
    },
    { id: "gate", name: "跑博客检查", kind: "code", tool: "博客仓库的检查（内容、格式、构建）", produces: ["检查结果.txt"] },
    { id: "publish", name: "提交并推送", kind: "code", tool: "git" },
    { id: "archive", name: "等上线并归档链接", kind: "code", tool: "访问文章地址" },
  ],
  say: "把这个写成博客",
  requires: ["repo-path", "site-url"],
}

/** 知乎三条工作流的公共说明：AI 步骤都以读账号档案和要求开头，写作规则在档案里（作者自己的知乎写作 skill） */
const ZHIHU_PROFILE_OPENING = "先整份读账号档案（里面写了知乎的写作规则或规则文件的位置）和要求；"
/** 「你去发布 / 你去回答」的同一句 ask：复制页怎么用、发完贴链接 */
const ZHIHU_PUBLISH_ASK =
  "在网页上点「打开复制页」，或者打开 {folder}/知乎发布稿.html：先点「复制正文」粘进知乎编辑器，再一张张点「复制这张图」贴到占位行。" +
  "发完把链接填在下面；要改就写要改哪里。"

/** 回答问题：灵感或直接新建，且要求里贴了知乎问题链接 */
export const ZHIHU_ANSWER: WorkflowDef = {
  id: "zhihu-answer",
  name: "回答问题",
  platform: "zhihu",
  from: "question",
  summary: "照要求里的问题链接出提纲，你确认后写回答，生成复制页你去发布，回来归档链接。",
  steps: [
    {
      id: "outline",
      name: "出提纲",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["提纲.md"],
      instructions:
        ZHIHU_PROFILE_OPENING +
        "读要求里的问题链接（打开问题页看标题和描述，看不到全文就按要求写），提纲第一行写问题标题和链接，存到 {folder}/提纲.md。",
    },
    {
      id: "confirm",
      name: "你确认提纲",
      kind: "manual",
      ask: "看 {folder}/提纲.md：没问题回「可以」；要改就写要改哪里",
    },
    {
      id: "draft",
      name: "写回答",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["回答.md"],
      instructions:
        ZHIHU_PROFILE_OPENING +
        "先读作者对提纲的反馈，要改就先改提纲再写。回答不写 `# 标题`，第一行就是正文，存到 {folder}/回答.md。" +
        "交稿前按写作规则的自检清单逐条过一遍。",
    },
    { id: "copy-page", name: "生成复制页", kind: "code", tool: "知乎复制页", produces: ["知乎发布稿.html"] },
    { id: "publish", name: "你去回答", kind: "manual", ask: ZHIHU_PUBLISH_ASK },
    { id: "archive", name: "归档链接", kind: "code", tool: "记录库" },
  ],
  say: "去知乎回答这个问题",
  requires: [],
}

/** 博客改写：来源是博客作品 */
export const ZHIHU_FROM_BLOG: WorkflowDef = {
  id: "zhihu-from-blog",
  name: "博客改写",
  platform: "zhihu",
  from: "blog-work",
  summary: "把来源博客文章照知乎的写法改写，生成复制页你去发布，回来归档链接。",
  steps: [
    {
      id: "rewrite",
      name: "改写成知乎文章",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["文章.md"],
      instructions:
        ZHIHU_PROFILE_OPENING +
        "读来源博客文章的原稿（任务说明里给出原稿位置和链接），照写作规则改成知乎口吻，存到 {folder}/文章.md。" +
        "正文第一行是 `# 标题`；流程图保留 mermaid 代码块；图片保留原来的写法。交稿前按写作规则的自检清单逐条过一遍。",
    },
    { id: "copy-page", name: "生成复制页", kind: "code", tool: "知乎复制页", produces: ["知乎发布稿.html"] },
    { id: "publish", name: "你去发布", kind: "manual", ask: ZHIHU_PUBLISH_ASK },
    { id: "archive", name: "归档链接", kind: "code", tool: "记录库" },
  ],
  say: "把这篇博客改写成知乎文章",
  requires: [],
}

/** 写文章：知乎上从零写一篇 */
export const ZHIHU_ARTICLE: WorkflowDef = {
  id: "zhihu-article",
  name: "写文章",
  platform: "zhihu",
  from: "idea",
  summary: "AI 出大纲你确认后写全文，生成复制页你去发布，回来归档链接。",
  steps: [
    {
      id: "outline",
      name: "出大纲",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["大纲.md"],
      instructions:
        ZHIHU_PROFILE_OPENING +
        "照写作规则的大纲格式写大纲存到 {folder}/大纲.md：每节写小标题、讲透什么、手上的具体材料、篇幅。" +
        "材料不够的标「缺」；末尾一行「本篇不讲什么」。",
    },
    {
      id: "confirm",
      name: "你确认大纲",
      kind: "manual",
      ask: "看 {folder}/大纲.md：没问题回「可以」；要改就写要改哪里",
    },
    {
      id: "draft",
      name: "写全文",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["文章.md"],
      instructions:
        ZHIHU_PROFILE_OPENING +
        "先读作者对大纲的反馈，要改就先改大纲再写；正文第一行是 `# 标题`，存到 {folder}/文章.md。交稿前按自检清单逐条过一遍。",
    },
    { id: "copy-page", name: "生成复制页", kind: "code", tool: "知乎复制页", produces: ["知乎发布稿.html"] },
    { id: "publish", name: "你去发布", kind: "manual", ask: ZHIHU_PUBLISH_ASK },
    { id: "archive", name: "归档链接", kind: "code", tool: "记录库" },
  ],
  say: "在知乎写这篇文章",
  requires: [],
}

/** 小红书图文卡片：卡片稿和文案交给 AI，出图和归档交给代码，发布由作者在手机上完成 */
export const XHS_CARDS: WorkflowDef = {
  id: "xhs-cards",
  name: "图文卡片",
  platform: "xiaohongshu",
  from: "any",
  summary: "AI 写卡片稿和文案，代码排成卡片图，你在手机上发，回来归档链接。",
  steps: [
    {
      id: "draft",
      name: "写卡片稿和文案",
      kind: "ai",
      tool: "按账号档案写",
      produces: ["卡片.md", "文案.md"],
      instructions:
        "先整份读账号档案、要求和来源（转来的作品先读原稿）。" +
        "把内容写成小红书图文卡片稿，存到 {folder}/卡片.md：封面一张、要点 4～8 张、总结一张，格式照下面的样子；" +
        "再写笔记文案存到 {folder}/文案.md：第一行 `# 标题`（20 字以内），正文 1000 字以内，不放链接，" +
        "最后一行 3～8 个话题标签（`#话题` 用空格分开）。\n\n" +
        "卡片稿 `卡片.md` 的格式：\n\n" +
        "```markdown\n" +
        "# 封面这一句：勾人的一句话（18 字以内）\n" +
        "副标题一行（可选，24 字以内）\n\n" +
        "---\n\n" +
        "## 要点标题（16 字以内）\n" +
        "- 一条一行，每页最多 5 条\n" +
        "- 每页正文合计 120 字以内\n\n" +
        "---\n\n" +
        "## 总结：标题\n" +
        "- 同要点页\n" +
        "```\n\n" +
        "页与页之间用单独一行 `---` 分开；第一页必须是封面，以 `# ` 开头；最后一页的标题以「总结」开头；" +
        "其余是要点页，以 `## ` 开头；页数 3～18。",
    },
    { id: "render", name: "排版卡片", kind: "code", tool: "卡片出图", produces: ["小红书发布稿.html"] },
    {
      id: "publish",
      name: "你在手机上发",
      kind: "manual",
      ask:
        "卡片图在 {folder}/卡片/，文案在 {folder}/文案.md；也可以在网页上点「打开发布稿」看图、复制文案。" +
        "把图传到手机，在小红书发图文笔记，发完把分享链接（整段分享文字也行）贴在下面；要改就写要改哪里。",
    },
    { id: "archive", name: "归档链接", kind: "code", tool: "记录库" },
  ],
  say: "把这篇做成小红书图文卡片",
  requires: [],
}

/** 全部发布工作流：平台专用的在前，通用的在最后 */
export const WORKFLOWS: WorkflowDef[] = [BLOG_WRITE, ZHIHU_ANSWER, ZHIHU_FROM_BLOG, ZHIHU_ARTICLE, XHS_CARDS, GENERAL_WRITE]
