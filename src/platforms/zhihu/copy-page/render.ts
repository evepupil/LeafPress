/**
 * Markdown 正文 → 复制页正文 HTML。
 *
 * 转换用 marked（gfm），定制四块：
 * - mermaid 代码块包成 `<figure class="fig" data-title="…"><pre class="mermaid">…</pre></figure>`；
 * - 图片包成同样的 figure，`src` 是已内嵌的 data URL；拿不到时输出占位行「【图片缺失：<原地址>】」；
 * - 原始 HTML（`<script>`、内联 `<img onerror>` 这类）一律转义成文字：复制页开在本机服务的
 *   地址下，原样保留等于让稿子在页面上执行任意脚本去调本机接口；
 * - 站内链接（以 `/` 开头）补成完整网址。改在 token 上改，代码块和行内代码里的
 *   `[x](/path)` 不会被误伤。
 *
 * figure 的 data-title：图片用 alt 文字（没写 alt 用图前最近一行文字）；mermaid 用代码块前
 * 最近的一行文字，找不到按顺序编号「流程图 N」。行号从 token.raw 的换行数累计出来：
 * 先 lexer 一遍记下每个顶层 token 的起始行，图片再从所在段落 token 的行号推出来。
 */
import { Marked, Renderer } from "marked";
import type { RendererObject, Tokens } from "marked";

/** 一张图的内嵌结果；dataUrl 没有时输出占位行 */
export interface ResolvedImage {
  dataUrl?: string;
}

/** 一次转换要用的东西 */
export interface RenderInput {
  markdown: string;
  /** Markdown 里出现的每个图片地址 → 内嵌结果 */
  images: Map<string, ResolvedImage>;
  /** 来源站点的 协议://主机；站内链接补全、占位行换回原路径用 */
  siteOrigin?: string;
}

/** 转换出的正文 HTML 和 figure 个数 */
export interface RenderResult {
  html: string;
  /** 生成的 figure 个数（图片缺失的占位行不算） */
  figures: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 属性值：HTML 转义之外，换行也压成空格 */
function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("\n", " ");
}

/** 一行文字拿来当 figure 标题：去掉 Markdown 记号，压掉空白 */
function figureTitleOf(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/[*_`~]/g, "")
    .trim();
}

/** 往上找最近一行非空、非表格的纯文字当标题 */
function nearestTitleAbove(
  markdown: string,
  endLine: number,
): string | undefined {
  const lines = markdown.split("\n");
  for (let i = endLine - 1; i >= 0; i--) {
    const line = (lines[i] ?? "").trim();
    if (!line || line.startsWith("|")) continue;
    const title = figureTitleOf(line);
    return title === "" ? undefined : title;
  }
  return undefined;
}

function figureHtml(title: string, content: string): string {
  return `<figure class="fig" data-title="${escapeAttr(title)}">${content}</figure>\n`;
}

/** 渲染时的图片地址是补全后的完整地址，占位行里换回稿子里的原地址 */
function originalHrefOf(href: string, siteOrigin: string | undefined): string {
  if (siteOrigin && href.startsWith(siteOrigin)) {
    return href.slice(siteOrigin.length);
  }
  return href;
}

/** 站内链接：以单个 / 开头（不是 //） */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** 每个 token 上要遍历的子节点键 */
const CHILD_KEYS = ["tokens", "items", "header", "rows"] as const;

/** 遍历 token 树，先序访问每个节点；表格 rows 是数组的数组，嵌套数组也要进 */
function walkTokens(
  nodes: readonly unknown[],
  visit: (node: Record<string, unknown>) => void,
): void {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      walkTokens(node, visit);
      continue;
    }
    const record = node as Record<string, unknown>;
    visit(record);
    for (const key of CHILD_KEYS) {
      const children = record[key];
      if (Array.isArray(children)) walkTokens(children, visit);
    }
  }
}

/** link / image / def token（引用式链接和引用式图片的定义）上共有的地址 */
interface HrefToken {
  type: string;
  href: string;
}

function asHrefToken(node: Record<string, unknown>): HrefToken | undefined {
  const type = node.type;
  const href = node.href;
  if (
    (type === "link" || type === "image" || type === "def") &&
    typeof href === "string"
  ) {
    return { type, href };
  }
  return undefined;
}

/**
 * 在 token 上改站内链接：link（含列表、引用、表格、引用式解析出来的）和 image
 * 都补成完整网址。引用式链接/图片在 lexer 阶段就解析成了 link/image token，def 不参与
 * 渲染。代码块、行内代码里的地址不在 token 里，不受影响。
 */
function completeInternalLinks(
  tokens: Tokens.Generic[],
  siteOrigin: string,
): void {
  walkTokens(tokens, (node) => {
    const token = asHrefToken(node);
    if (token && isInternalHref(token.href)) {
      node.href = siteOrigin + token.href;
    }
  });
}

/** 每个 token 的起始行 + 「当前正在渲染的段落」的起始行（图片取标题用） */
interface LineTracking {
  startLine: Map<Tokens.Generic, number>;
  current: { value: number };
}

/** 把正文 Markdown 转成正文 HTML */
export function renderBody(input: RenderInput): RenderResult {
  const { markdown, images, siteOrigin } = input;
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(markdown);

  const tracking: LineTracking = {
    startLine: new Map(),
    current: { value: 0 },
  };
  const { startLine, current } = tracking;
  let line = 0;
  for (const token of tokens) {
    startLine.set(token, line);
    line += (token.raw.match(/\n/g) ?? []).length;
  }

  // 站内链接和站内图片都在 token 上补全（代码块、行内代码不动）
  if (siteOrigin) completeInternalLinks(tokens, siteOrigin);

  const figures = { next: 0 };
  const number = (): number => {
    figures.next += 1;
    return figures.next;
  };

  const defaultRenderer = new Renderer();
  const renderer: RendererObject = {
    paragraph(this, token) {
      current.value = startLine.get(token) ?? 0;
      const inner = this.parser.parseInline(token.tokens);
      // 只装 figure 或占位行的段落不要 <p> 包裹（figure 单独成块，占位行自己带 <p>）
      if (/^<(figure|p>【图片缺失)/.test(inner)) return inner;
      return `<p>${inner}</p>\n`;
    },
    html(token) {
      // 原始 HTML 一律转义成文字，页面上不放稿子里的可执行标签
      return defaultRenderer.text({
        type: "text",
        raw: token.raw,
        text: token.text,
      });
    },
    code(token) {
      if (token.lang !== "mermaid") return defaultRenderer.code(token);
      const title =
        nearestTitleAbove(markdown, startLine.get(token) ?? 0) ??
        `流程图 ${number()}`;
      return figureHtml(
        title,
        `<pre class="mermaid">${escapeHtml(token.text)}</pre>`,
      );
    },
    image(token) {
      const index = number();
      const alt = token.text.trim();
      const dataUrl = images.get(token.href)?.dataUrl;
      if (!dataUrl) {
        const original = originalHrefOf(token.href, siteOrigin);
        return `<p>【图片缺失：${escapeHtml(original)}】</p>\n`;
      }
      const title =
        alt || (nearestTitleAbove(markdown, current.value) ?? `图 ${index}`);
      return figureHtml(
        title,
        `<img src="${dataUrl}" alt="${escapeAttr(alt)}">`,
      );
    },
    link(this, token) {
      if (token.tokens.length > 0) {
        return `<a href="${escapeAttr(token.href)}"${token.title ? ` title="${escapeAttr(token.title)}"` : ""}>${this.parser.parseInline(token.tokens)}</a>`;
      }
      const text = token.text;
      if (token.href === text) return escapeHtml(text);
      return `${text}（${escapeHtml(token.href)}）`;
    },
    // 表格单元格：默认实现用 token.text（原文，链接在里面不会被解析）；
    // 换成子 token 内联渲染，单元格里的站内链接才能走到上面改过的 link token
    tablecell(this, token) {
      const tag = token.header ? "th" : "td";
      const open = token.align ? `<${tag} align="${token.align}">` : `<${tag}>`;
      return `${open}${this.parser.parseInline(token.tokens)}</${tag}>`;
    },
  };

  const html = new Marked({ renderer, gfm: true }).parser(tokens);
  return { html, figures: figures.next };
}
