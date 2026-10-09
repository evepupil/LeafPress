/**
 * 复制页整页 HTML 的拼装：模板（样式、脚本）加上标题和正文。
 * 页面结构和样式照作者的原件 `知乎发布稿.html` 移植。
 */

export interface CopyPageHtmlInput {
  /** 文章标题；回答没有标题 */
  title?: string;
  /** 正文 HTML（已转好） */
  body: string;
  /** <style> 里的样式 */
  styles: string;
  /** <script> 里的脚本 */
  script: string;
  /** mermaid 的 CDN 地址；没有流程图也可以照常引用 */
  mermaidSrc: string;
}

/** 生成整页 HTML */
export function buildCopyPageHtml(input: CopyPageHtmlInput): string {
  const titleTag = escapeText(input.title ?? "知乎发布稿");
  const heading = input.title
    ? `  <h1>${escapeText(input.title)}</h1>\n\n`
    : "";
  const body = input.body.trim();
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${titleTag}</title>`,
    "<style>",
    input.styles,
    "</style>",
    "</head>",
    "<body>",
    "",
    '<div class="bar">',
    '  <button id="copyBtn" type="button">复制正文</button>',
    '  <span id="hint">正文里的图会变成占位行，再用每张图下面的按钮单独复制图片粘上去</span>',
    "</div>",
    "",
    '<div class="wrap">',
    '<div id="zhihu-body">',
    "",
    heading,
    body,
    "",
    "</div>",
    "</div>",
    "",
    `<script src="${input.mermaidSrc}"></script>`,
    "<script>",
    input.script,
    "</script>",
    "",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** 文本节点里用的转义 */
function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
