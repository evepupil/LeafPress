/**
 * 生成复制页（copy-page）：把任务文件夹里的稿子转成 `知乎发布稿.html`。
 *
 * 照规格《平台适配 · 知乎》第 1～6 条：
 * 1. 去掉开头的 frontmatter；文章取第一行 `# 标题` 当标题（正文里去掉），回答没有标题；
 * 2. 以 `/` 开头的站内链接补成来源博客的完整网址（取来源作品链接的 `协议://主机`）；
 * 3. 博客改写（有来源作品）在文末加「原文：<来源博客文章链接>」；
 * 4. 图片一律内嵌成 data URL：先任务文件夹里的同名文件，再来源博客仓库 `public/` 下对应路径，
 *    再用 ctx.fetch 下载（站内拼站点地址、外链原样，10 秒超时）；
 *    都拿不到换成占位行「【图片缺失：<原地址>】」；
 * 5. Markdown 转 HTML 用 marked（转换在 copy-page/render.ts）；
 * 6. 套 copy-page/template.ts 的模板。
 *
 * 同一份稿子、同样的素材每次生成一样的页面，可以重复执行，每次覆盖。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CodeOutcome } from "@leafpress/core";

import {
  COPY_PAGE_SCRIPT,
  COPY_PAGE_STYLES,
  MERMAID_CDN,
} from "../copy-page/template.js";
import { renderBody } from "../copy-page/render.js";
import type { CodeStepContext, CodeStepHandler } from "../../types.js";
import { resolveImages } from "./images.js";
import { buildCopyPageHtml } from "./page.js";

const ARTICLE_FILE = "文章.md";
const ANSWER_FILE = "回答.md";
const OUTPUT_FILE = "知乎发布稿.html";

/** 去掉开头的 frontmatter（--- … ---）；没有就原样返回 */
function stripFrontmatter(source: string): string {
  if (!source.startsWith("---")) return source;
  const end = source.indexOf("\n---", 3);
  if (end === -1) return source;
  const after = source.indexOf("\n", end + 1);
  return after === -1 ? "" : source.slice(after + 1);
}

/** 稿子的构成：frontmatter 去掉、标题摘出来之后 */
export interface PreparedDraft {
  /** 正文 Markdown（原文链接那行已追加） */
  body: string;
  /** 回答没有标题 */
  title?: string;
}

/** 读稿子、摘标题；文章去掉第一行 `# 标题` */
function prepareDraft(
  source: string,
  isAnswer: boolean,
  sourceUrl: string | undefined,
): PreparedDraft {
  let body = stripFrontmatter(source);
  let title: string | undefined;
  if (!isAnswer) {
    const heading = /^#\s+(.+)$/m.exec(body);
    if (heading) {
      title = (heading[1] ?? "").trim();
      body = body.replace(heading[0], "");
    }
  }
  body = body.trim();
  // 博客改写：文末加原文链接；作者自己写了就不重复加
  if (sourceUrl && !body.includes(sourceUrl)) {
    body = `${body}\n\n原文：${sourceUrl}`;
  }
  return { body, title };
}

/** 生成复制页 */
export const generateCopyPage: CodeStepHandler = async (
  ctx: CodeStepContext,
): Promise<CodeOutcome> => {
  const isAnswer = ctx.workflow.id === "zhihu-answer";
  const file = isAnswer ? ANSWER_FILE : ARTICLE_FILE;

  let source: string;
  try {
    source = await readFile(join(ctx.folder, file), "utf8");
  } catch (error) {
    const missing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT";
    return {
      kind: "fail",
      error: missing
        ? `任务文件夹里没有 ${file}，先让上一步把稿子写出来`
        : `${file} 读不出来：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const sourceUrl = ctx.sourceWork?.url;
  const draft = prepareDraft(source, isAnswer, sourceUrl);
  const siteOrigin = siteOriginOf(sourceUrl);

  // 图片内嵌按稿子里的原地址找；站内链接的补全在渲染时改 token，两不耽误
  const resolved = await resolveImages(ctx, draft.body);
  const images = new Map(resolved.map((image) => [image.href, image] as const));
  const missing = resolved
    .filter((image) => !image.dataUrl)
    .map((image) => image.originalHref);

  const rendered = renderBody({ markdown: draft.body, images, siteOrigin });
  const html = buildCopyPageHtml({
    title: draft.title,
    body: rendered.html,
    styles: COPY_PAGE_STYLES,
    script: COPY_PAGE_SCRIPT,
    mermaidSrc: MERMAID_CDN,
  });
  await writeFile(join(ctx.folder, OUTPUT_FILE), html, "utf8");

  const figureCount = (html.match(/<figure class="fig"/g) ?? []).length;
  if (missing.length > 0) {
    return {
      kind: "done",
      note: `复制页已生成：${figureCount} 张图；缺 ${missing.length} 张：${missing.join("、")}`,
    };
  }
  return { kind: "done", note: `复制页已生成：${figureCount} 张图` };
};

/** 站点根：协议://主机；不是网址就没有 */
function siteOriginOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return undefined;
  }
}
