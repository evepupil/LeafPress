/**
 * 小红书发布稿预览页：卡片图竖排 + 文案 + 「复制文案」按钮。
 *
 * - 卡片图内嵌成 data URL（离线也能看），按页序竖排，宽度适应窗口；
 * - 文案里的标题、正文、标签都做 HTML 转义（稿子是 AI 写的，可能带 < > &）；
 * - 「复制文案」用 navigator.clipboard 写 text/plain；API 不在（file:// 下部分浏览器不给）
 *   就退回 execCommand。
 * 只放拼页面的纯函数，读写文件在 render.ts。
 */
import type { CopyDraft } from "./copy.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** PNG 文件头；别的格式（理论上不该有）按探测到的写 */
function dataUrlMime(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  return "application/octet-stream";
}

/** 文本节点里用的转义 */
function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * 属性值里用的转义：文本转义之外，换行、回车、制表也压掉（属性值里的换行
 * 浏览器不保留，塞进去也会变样）。复制用的原文因此不放属性里，改走
 * `<script type="application/json">`（见 rawCopyScript）。
 */
function escapeAttr(value: string): string {
  return escapeText(value)
    .replaceAll("\n", " ")
    .replaceAll("\r", " ")
    .replaceAll("\t", " ");
}

const PAGE_STYLES = `
  body { margin: 0; background: #f6f6f6; color: #1a1a1a; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif; }
  .bar { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e4e4e4; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
  .bar button { background: #ff2442; color: #fff; border: 0; border-radius: 4px; padding: 8px 18px; font-size: 14px; cursor: pointer; }
  .bar button:hover { background: #d91d38; }
  #hint { font-size: 13px; color: #8590a6; }
  .wrap { max-width: 560px; margin: 24px auto 80px; }
  .cards img { display: block; width: 100%; height: auto; margin: 0 0 12px; border-radius: 6px; background: #fff; }
  #copy-text { background: #fff; border-radius: 6px; padding: 24px 28px 32px; }
  #copy-text h1 { font-size: 20px; margin: 0 0 12px; }
  #copy-text p { font-size: 15px; line-height: 1.78; margin: 0 0 12px; white-space: pre-wrap; }
  #copy-text p.tags { color: #13386c; margin: 16px 0 0; }
`.trim();

// 正文容器有 id="copyText"（样式用的 #copy-text，两处同名、样式只用后一个）；复制用的原文在 id="copyRaw" 的 JSON script 里

const PAGE_SCRIPT = `
(function () {
  var btn = document.getElementById('copyBtn');
  var hint = document.getElementById('hint');
  // 复制用的原文放在 type="application/json" 的 script 里（浏览器不当脚本执行），
  // 换行完整保留；不能放 data-* 属性：属性值里的换行在拿到时已经丢了
  var raw = document.getElementById('copyRaw');
  btn.addEventListener('click', function () {
    var text = JSON.parse(raw.textContent || '""');
    var done = function () { hint.textContent = '文案已复制，去小红书粘贴'; };
    var fail = function (err) { hint.textContent = '复制失败：' + (err && err.message ? err.message : err); };
    // 优先用异步剪贴板 API 写纯文本；file:// 页面上有的浏览器不给这个 API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(text, done, fail); });
    } else {
      fallback(text, done, fail);
    }
  });
  // execCommand 降级：把全文塞进一个看不见的 textarea 里选中再复制
  function fallback(text, done, fail) {
    try {
      var holder = document.createElement('textarea');
      holder.value = text;
      holder.style.position = 'fixed';
      holder.style.left = '-99999px';
      document.body.appendChild(holder);
      holder.focus();
      holder.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(holder);
      ok ? done() : fail(new Error('浏览器不让复制'));
    } catch (e) {
      fail(e);
    }
  }
})();
`.trim();

export interface PreviewPageInput {
  /** 卡片图的原始字节和文件名，按页序 */
  images: { file: string; bytes: Buffer }[];
  copy: CopyDraft;
}

/** 要进剪贴板的纯文本：标题、空行、正文、空行、标签行 */
export function copyPlainText(copy: CopyDraft): string {
  return [
    copy.title,
    "",
    copy.body,
    "",
    copy.tags.map((tag) => `#${tag}`).join(" "),
  ].join("\n");
}

/** 文案 → 页面上的 HTML（标题、正文段、标签行；全部转义） */
function copyHtml(copy: CopyDraft): string {
  const lines = [
    `    <h1>${escapeText(copy.title)}</h1>`,
    ...copy.body
      .split("\n")
      .map((line) => `    <p>${line === "" ? "<br>" : escapeText(line)}</p>`),
  ];
  if (copy.tags.length > 0) {
    lines.push(
      `    <p class="tags">${escapeText(copy.tags.map((tag) => `#${tag}`).join(" "))}</p>`,
    );
  }
  return lines.join("\n");
}

/**
 * 复制用的原文：写成 JSON 字符串包进 `<script type="application/json">`（浏览器不执行它）。
 * script 里的内容浏览器不做实体还原，所以 `<` 不能写成 `&lt;`（复制出来会变成字面的 &lt;），
 * 要写成 JSON 的 `<`：既不会提前闭合 script，JSON.parse 后又是原来的 `<`。
 */
function rawCopyScript(raw: string): string {
  return [
    '  <script type="application/json" id="copyRaw">',
    JSON.stringify(raw).replaceAll("<", "\\u003c"),
    "  </script>",
  ].join("\n");
}

/** 生成整页 HTML */
export function buildPreviewPage(input: PreviewPageInput): string {
  const cards = input.images
    .map(
      (image) =>
        `    <img src="data:${dataUrlMime(image.bytes)};base64,${image.bytes.toString("base64")}" alt="${escapeAttr(image.file)}">`,
    )
    .join("\n");

  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(input.copy.title || "小红书发布稿")}</title>`,
    "<style>",
    PAGE_STYLES,
    "</style>",
    "</head>",
    "<body>",
    "",
    '<div class="bar">',
    '  <button id="copyBtn" type="button">复制文案</button>',
    '  <span id="hint">卡片图在下面，文案在页面底部</span>',
    "</div>",
    "",
    '<div class="wrap">',
    '  <div class="cards">',
    cards,
    "  </div>",
    `  <div id="copyText">`,
    copyHtml(input.copy),
    "  </div>",
    "</div>",
    "",
    rawCopyScript(copyPlainText(input.copy)),
    "<script>",
    PAGE_SCRIPT,
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
