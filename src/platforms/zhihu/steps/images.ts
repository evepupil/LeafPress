/**
 * 图片内嵌：按规格的顺序找一张图，能拿到的转成 data URL。
 *
 * 1. 任务文件夹里的同名文件（地址最后一段、按 URL 解码）；
 * 2. 来源博客仓库 `public/` 下对应路径：仓库根从来源作品原稿位置往上推（<仓库>/content/posts/<语言>/<slug>.mdx）；
 * 3. 用 ctx.fetch 下载（10 秒超时）：站内地址拼来源站点，外链地址原样。
 *
 * 图片地址从 marked 的 token 上收集（内联、引用式定义都认，代码块里的不算图片），
 * 站内（/…）和外链（https://…）都内嵌；拿不到才当缺图。
 * 本地读取有目录限制：解析出的路径必须仍在任务文件夹或来源仓库 public/ 之内，
 * 编码过的 ../ 解码后会越界，一律当缺图。
 */
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Marked } from "marked";

import type { CodeStepContext } from "../../types.js";
import type { ResolvedImage } from "../copy-page/render.js";

/** 远程下载图片的时限 */
const FETCH_TIMEOUT_MS = 10_000;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

/** 一张图的查找结果 */
export interface ImageLookup extends ResolvedImage {
  /** Markdown 里出现的地址（站内补全后的键，和渲染时对得上） */
  href: string;
  /** 稿子里的原地址；站内的是 /… 的相对路径 */
  originalHref: string;
}

function mimeType(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return IMAGE_MIME[ext] ?? "application/octet-stream";
}

/** 站内地址：以单个 / 开头（不是 //） */
function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** 遍历 token 树要看的子节点键 */
const CHILD_KEYS = ["tokens", "items", "header", "rows"] as const;

/**
 * 从 token 上收集图片地址（image 节点和引用式定义 def 节点），
 * 按出现顺序；站内地址同时给出补全后的完整地址。
 */
export function collectImages(
  markdown: string,
  siteOrigin: string | undefined,
): ImageLookup[] {
  const tokens = new Marked({ gfm: true }).lexer(markdown);
  const found = new Map<string, ImageLookup>();
  const add = (originalHref: string): void => {
    // 同一个地址只查一次（引用式定义和内联都指它时不重复算缺图）
    if (found.has(originalHref)) return;
    found.set(originalHref, {
      href:
        siteOrigin && isInternal(originalHref)
          ? siteOrigin + originalHref
          : originalHref,
      originalHref,
    });
  };
  const visit = (nodes: readonly unknown[]): void => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      // 表格 rows 是数组的数组，嵌套数组也要进
      if (Array.isArray(node)) {
        visit(node);
        continue;
      }
      const record = node as Record<string, unknown>;
      const type = record.type;
      const href = record.href;
      if (
        (type === "image" || type === "def") &&
        typeof href === "string" &&
        href !== ""
      ) {
        // def 是引用式定义，可能是链接也可能是图片；按扩展名认，引用式链接的定义不收
        if (type === "image" || isImageLikeHref(href)) add(href);
      }
      for (const key of CHILD_KEYS) {
        const children = record[key];
        if (Array.isArray(children)) visit(children);
      }
    }
  };
  visit(tokens);
  return [...found.values()];
}

/** def 节点的地址是不是图片的（按扩展名认；引用式链接的定义不收） */
function isImageLikeHref(href: string): boolean {
  const clean = href.split("?")[0]?.split("#")[0] ?? href;
  const ext = clean.slice(clean.lastIndexOf(".")).toLowerCase();
  return ext !== "" && ext in IMAGE_MIME;
}

/** 来源博客仓库根：<仓库>/content/posts/<语言>/<slug>.mdx 往上三层 */
function repoRootOf(localPath: string | undefined): string | undefined {
  if (!localPath) return undefined;
  return dirname(dirname(dirname(dirname(localPath))));
}

/** 地址最后一段当文件名，按 URL 解码；不是合法的百分号编码就原样用 */
function fileNameOf(href: string): string {
  const raw = href.split("?")[0]?.split("#")[0] ?? href;
  const last = raw.split("/").at(-1) ?? raw;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** resolve 后 target 是否仍在 base 目录之内（等于 base 也算在内） */
function isInside(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target));
  if (rel === "") return true;
  return rel !== ".." && !isAbsolute(rel) && !rel.startsWith(`..${sep}`);
}

/**
 * 读任务文件夹里的同名文件：路径里的 .. 解码后必须仍在任务文件夹内，
 * 越界（路径穿越）当缺图处理，不给读到文件夹外的文件。
 */
async function readFromFolder(
  folder: string,
  originalHref: string,
): Promise<string | undefined> {
  const name = fileNameOf(originalHref);
  if (name.includes("/") || name.includes(sep) || name === "") return undefined;
  const path = join(folder, name);
  if (!isInside(folder, path)) return undefined;
  return readLocalImage(path);
}

/**
 * 读来源博客仓库 public/ 下的对应路径：站内地址的每一段解码后拼回去，
 * 解析出的路径必须仍在 public/ 之内，越界（路径穿越）当缺图。
 */
async function readFromRepo(
  repoRoot: string,
  originalHref: string,
): Promise<string | undefined> {
  const clean = originalHref.split("?")[0]?.split("#")[0] ?? originalHref;
  if (!clean.startsWith("/")) return undefined;
  const segments: string[] = [];
  for (const segment of clean.split("/").slice(1)) {
    try {
      segments.push(decodeURIComponent(segment));
    } catch {
      // 不是合法的百分号编码，原样用
      segments.push(segment);
    }
  }
  const base = join(repoRoot, "public");
  const path = join(base, ...segments);
  if (!isInside(base, path)) return undefined;
  return readLocalImage(path);
}

/** 读一个本地图片文件，转成 data URL；读不到或不是文件返回 undefined */
async function readLocalImage(path: string): Promise<string | undefined> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return undefined;
    const data = await readFile(path);
    return `data:${mimeType(path)};base64,${data.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** 用 ctx.fetch 下载图片（站内已拼好完整地址，外链原样），转成 data URL */
async function downloadImage(
  ctx: CodeStepContext,
  url: string,
): Promise<string | undefined> {
  try {
    const response = await ctx.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return undefined;
    const type = response.headers.get("content-type") ?? mimeType(url);
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** 把正文里每个图片地址内嵌成 data URL；拿不到的记下来 */
export async function resolveImages(
  ctx: CodeStepContext,
  markdown: string,
): Promise<ImageLookup[]> {
  const siteOrigin = siteOriginOf(ctx.sourceWork?.url);
  const repoRoot = repoRootOf(ctx.sourceWork?.localPath);
  const results: ImageLookup[] = [];
  for (const image of collectImages(markdown, siteOrigin)) {
    const dataUrl = await lookup(ctx, image, siteOrigin, repoRoot);
    results.push({ ...image, dataUrl });
  }
  return results;
}

/** 按规格的顺序找一张图 */
async function lookup(
  ctx: CodeStepContext,
  image: ImageLookup,
  siteOrigin: string | undefined,
  repoRoot: string | undefined,
): Promise<string | undefined> {
  // 外链图片只能下载
  if (!isInternal(image.originalHref)) {
    return downloadImage(ctx, image.originalHref);
  }

  // 1. 任务文件夹里的同名文件
  const inFolder = await readFromFolder(ctx.folder, image.originalHref);
  if (inFolder) return inFolder;

  // 2. 来源博客仓库 public/ 下对应路径
  if (repoRoot) {
    const inRepo = await readFromRepo(repoRoot, image.originalHref);
    if (inRepo) return inRepo;
  }

  // 3. 从站点下载
  if (siteOrigin) return downloadImage(ctx, image.href);
  return undefined;
}

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
