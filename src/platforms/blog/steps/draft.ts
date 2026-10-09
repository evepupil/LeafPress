/**
 * 任务文件夹里的稿子：读出来、校验、算哈希。
 *
 * 稿子文件：中文稿.mdx、英文稿.mdx、slug.txt、images/ 下的全部文件（可以没有）。
 * 校验不碰博客仓库，问题都写成作者和 agent 一看就懂的中文，抛 DraftError。
 * frontmatter 用 gray-matter 的默认引擎读，和博客自己的检查脚本一致：
 * 不带引号的 published: 2026-10-08 会被读成日期对象，博客的检查会不过，这里提前拦下。
 */
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import matter from "gray-matter";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SLUG_FILE = "slug.txt";
const CHINESE_FILE = "中文稿.mdx";
const ENGLISH_FILE = "英文稿.mdx";
const IMAGES_DIR = "images";

/** 稿子本身有问题（不是系统故障）；message 直接给人看 */
export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}

export interface DraftImage {
  /** 任务文件夹里的绝对路径 */
  source: string;
  /** 相对 images/ 的路径，用 / 分隔 */
  path: string;
}

export interface DraftArticle {
  /** 任务文件夹里的绝对路径 */
  file: string;
  title: string;
  /** YYYY-MM-DD */
  published: string;
  translationKey: string;
}

export interface Draft {
  folder: string;
  slug: string;
  chinese: DraftArticle;
  english: DraftArticle;
  images: DraftImage[];
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

/** 读 slug.txt；格式不对抛 DraftError */
export async function readSlug(folder: string): Promise<string> {
  let text: string;
  try {
    text = await readFile(join(folder, SLUG_FILE), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT")
      throw new DraftError(
        "找不到 slug.txt：把文章的 slug（小写英文和数字，用 - 连接）写进去",
      );
    throw error;
  }
  const slug = text.trim();
  if (!SLUG_PATTERN.test(slug)) {
    throw new DraftError(
      `slug.txt 里的 slug 格式不对（${JSON.stringify(slug.slice(0, 60))}）：只能用小写英文和数字，单词之间用 - 连接`,
    );
  }
  return slug;
}

async function readArticleText(file: string, label: string): Promise<string> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") throw new DraftError(`${label} 不存在`);
    throw error;
  }
  if (text.trim() === "") throw new DraftError(`${label} 是空的`);
  return text;
}

/** 日历上真有这一天（2026-02-31 不算） */
function isRealDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readFrontmatter(text: string, label: string): Record<string, unknown> {
  try {
    return matter(text).data;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DraftError(`${label} 的头部（frontmatter）读不出来：${reason}`);
  }
}

function requireText(
  data: Record<string, unknown>,
  key: string,
  label: string,
  hint?: string,
): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "")
    throw new DraftError(`${label} 缺少 ${key}${hint ? `（${hint}）` : ""}`);
  return value;
}

/** published 必须是带引号的 YYYY-MM-DD 字符串 */
function requirePublished(
  data: Record<string, unknown>,
  label: string,
): string {
  const value = data["published"];
  if (value instanceof Date) {
    throw new DraftError(
      `${label} 的 published 没加引号，要写成 published: "YYYY-MM-DD"（不带引号会被读成日期，博客的检查过不了）`,
    );
  }
  if (typeof value !== "string" || !isRealDay(value)) {
    throw new DraftError(
      `${label} 的 published 要写成带引号的日期 "YYYY-MM-DD"`,
    );
  }
  return value;
}

function parseArticle(
  text: string,
  file: string,
  label: string,
  locale: "zh-CN" | "en",
): DraftArticle {
  const data = readFrontmatter(text, label);
  if (data["draft"] === true) {
    throw new DraftError(
      `稿子写了 draft: true，博客不会显示，改成 false（${label}）`,
    );
  }
  const title = requireText(data, "title", label);
  if (data["locale"] !== locale) {
    throw new DraftError(`${label} 的 locale 要写 "${locale}"`);
  }
  const published = requirePublished(data, label);
  const translationKey = requireText(
    data,
    "translationKey",
    label,
    "中英文两篇都要写，并且相同",
  );
  return { file, title, published, translationKey };
}

async function collectImages(folder: string): Promise<DraftImage[]> {
  const root = join(folder, IMAGES_DIR);
  try {
    const info = await lstat(root);
    if (info.isSymbolicLink())
      throw new DraftError("images 不能是符号链接，要放真正的文件夹");
    if (!info.isDirectory())
      throw new DraftError("images 应该是文件夹，里面放文章用的图片");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }

  const images: DraftImage[] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const source = join(directory, name);
      const path = prefix === "" ? name : `${prefix}/${name}`;
      const outside = relative(root, source);
      if (outside.startsWith("..") || isAbsolute(outside)) {
        throw new DraftError(`images 里有跑出文件夹的路径：${path}`);
      }
      const info = await lstat(source);
      if (info.isSymbolicLink())
        throw new DraftError(`images 里不能有符号链接：${path}`);
      if (info.isDirectory()) {
        await walk(source, path);
      } else if (info.isFile()) {
        images.push({ source, path });
      } else {
        throw new DraftError(`images 里只能放普通文件：${path}`);
      }
    }
  };
  await walk(root, "");
  return images;
}

/** 读并校验稿子。不碰博客仓库；有问题抛 DraftError */
export async function loadDraft(folder: string): Promise<Draft> {
  const slug = await readSlug(folder);
  const chineseFile = join(folder, CHINESE_FILE);
  const englishFile = join(folder, ENGLISH_FILE);
  const chineseText = await readArticleText(chineseFile, CHINESE_FILE);
  const englishText = await readArticleText(englishFile, ENGLISH_FILE);
  const images = await collectImages(folder);

  const chinese = parseArticle(chineseText, chineseFile, CHINESE_FILE, "zh-CN");
  const english = parseArticle(englishText, englishFile, ENGLISH_FILE, "en");
  if (chinese.translationKey !== english.translationKey) {
    throw new DraftError(
      `中文稿和英文稿的 translationKey 要相同（现在是 ${JSON.stringify(chinese.translationKey)} 和 ${JSON.stringify(english.translationKey)}）`,
    );
  }
  return { folder, slug, chinese, english, images };
}

/** 只读中文稿的发布日期（归档用）；不检查稿子的其他地方 */
export async function readPublishedDay(folder: string): Promise<string> {
  const data = readFrontmatter(
    await readArticleText(join(folder, CHINESE_FILE), CHINESE_FILE),
    CHINESE_FILE,
  );
  return requirePublished(data, CHINESE_FILE);
}

/** 指纹去哪里读两篇稿子和图片；缺省读任务文件夹里的，复制进检出目录的那一份用它指过去 */
export interface DraftFileLocations {
  chinese: string;
  english: string;
  /** 一张图片（相对 images/ 的路径）的位置 */
  imageFile(path: string): string;
}

/**
 * 稿子的指纹：对 slug.txt、两篇稿子、images/ 下全部文件，按相对路径排序后，
 * 逐个把「相对路径 + 内容」喂给 sha256。检查之后稿子或 slug 有任何改动，指纹都会变。
 * slug.txt 只在任务文件夹里，永远从那里读。
 */
export async function hashDraft(
  draft: Draft,
  locations?: DraftFileLocations,
): Promise<string> {
  const files = [
    { name: SLUG_FILE, file: join(draft.folder, SLUG_FILE) },
    { name: CHINESE_FILE, file: locations?.chinese ?? draft.chinese.file },
    { name: ENGLISH_FILE, file: locations?.english ?? draft.english.file },
    ...draft.images.map((image) => ({
      name: `${IMAGES_DIR}/${image.path}`,
      file: locations?.imageFile(image.path) ?? image.source,
    })),
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const hash = createHash("sha256");
  for (const { name, file } of files) {
    const content = await readFile(file);
    hash
      .update(name, "utf8")
      .update("\0")
      .update(String(content.length))
      .update("\0")
      .update(content);
  }
  return hash.digest("hex");
}

/**
 * 任务文件夹里稿子此刻的指纹；稿子读不出来了（被改坏、文件被删）返回 undefined。
 * 整个文件夹重新读一遍再算，所以期间新增、删掉图片也看得出来，不会被开始时的文件清单蒙住。
 */
export async function currentDraftHash(
  folder: string,
): Promise<string | undefined> {
  try {
    return await hashDraft(await loadDraft(folder));
  } catch (error) {
    if (error instanceof DraftError || errorCode(error) === "ENOENT")
      return undefined;
    throw error;
  }
}
