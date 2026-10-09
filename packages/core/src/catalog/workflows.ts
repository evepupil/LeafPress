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

/** 全部发布工作流：平台专用的在前，通用的在最后 */
export const WORKFLOWS: WorkflowDef[] = [BLOG_WRITE, GENERAL_WRITE]
