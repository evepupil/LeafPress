/**
 * 博客正文分析：从 Markdown 正文里取图片、流程图、站内链接。
 *
 * 原理：unified + remark-parse + remark-gfm 解析成 mdast，再用 unist-util-visit 遍历。
 * 正文里出现 MDX 组件、import 语句时，解析成 jsx 节点或普通文本，不报错即可。
 * 地址一律原样保留（不做编码、不拼域名），由后续步骤决定怎么用。
 */
import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import { unified } from "unified";

/** 正文分析结果 */
export interface BodyAnalysis {
  /** 图片地址，按出现顺序，重复的也保留 */
  readonly images: readonly string[];
  /** 语言标记为 mermaid 的代码块个数 */
  readonly mermaidBlockCount: number;
  /** 站内链接地址，按出现顺序，重复的也保留 */
  readonly internalLinks: readonly string[];
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** 外部协议：匹配 http:、mailto: 之类「协议:」开头 */
const HAS_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * 真实数据里的嵌套链接形态：地址以 "[" 或 "<[" 开头，里面是 [文字](https://...)。
 * Markdown 解析器会把整串当成地址，但它是被转义失败的外链，不能算站内。
 */
function isNestedUrlForm(url: string): boolean {
  if (!url.startsWith("[") && !url.startsWith("<[")) return false;
  return (
    url.includes("](") && HAS_PROTOCOL_RE.test(url.slice(url.indexOf("](") + 2))
  );
}

/**
 * 站内链接：以单个 / 开头（不是 //），或不带协议、不以 # 开头的相对地址。
 * 外链：以协议开头（https:、mailto: 等）或以 // 开头。
 * 真实数据里的嵌套形态（<[https://x](https://x)>、[https://x](https://x)）也算外链。
 */
export function isInternalLink(url: string): boolean {
  if (url.startsWith("//")) return false;
  if (HAS_PROTOCOL_RE.test(url)) return false;
  if (isNestedUrlForm(url)) return false;
  if (url.startsWith("/")) return true;
  return !url.startsWith("#");
}

/**
 * 收集 definition 节点（引用式图片/链接的定义）：标签 → 地址。
 * mdast 里 definition 可能出现在任何层级，先进一张表再遍历引用。
 */
function collectDefinitions(tree: Root | RootContent): Map<string, string> {
  const definitions = new Map<string, string>();
  visit(tree, "definition", (node) => {
    definitions.set(node.identifier.toUpperCase(), node.url);
  });
  return definitions;
}

/** 解析正文并分析图片、流程图、站内链接 */
export function analyzeBody(markdown: string): BodyAnalysis {
  const tree = parser.parse(markdown);
  const definitions = collectDefinitions(tree);

  const images: string[] = [];
  const internalLinks: string[] = [];
  let mermaidBlockCount = 0;

  visit(tree, (node) => {
    if (node.type === "code") {
      if (node.lang === "mermaid") {
        mermaidBlockCount += 1;
      }
      return;
    }
    if (node.type === "image" || node.type === "imageReference") {
      // image：地址直接在节点上；imageReference：按同文的 definition 解析，找不到就算了
      const url =
        node.type === "image"
          ? node.url
          : (definitions.get(node.identifier.toUpperCase()) ?? undefined);
      if (url !== undefined) {
        images.push(url);
      }
      return;
    }
    if (node.type === "link" || node.type === "linkReference") {
      // 图片地址不算链接，只看 link / linkReference
      const url =
        node.type === "link"
          ? node.url
          : (definitions.get(node.identifier.toUpperCase()) ?? undefined);
      if (url !== undefined && isInternalLink(url)) {
        internalLinks.push(url);
      }
      return;
    }
    if (node.type === "html") {
      // HTML 片段里的 <img src="...">：用正则取 src，够用且不引入依赖
      for (const match of node.value.matchAll(
        /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi,
      )) {
        const url = match[1] ?? match[2] ?? match[3];
        if (url !== undefined && url !== "") {
          images.push(url);
        }
      }
    }
  });

  return { images, mermaidBlockCount, internalLinks };
}
