/**
 * 稿子进出博客检出目录：目标路径、撞车检查、只新建地复制、排好版的稿子复制回来。
 *
 * 目标路径都在检出目录里：
 *   content/posts/zh/<slug>.mdx、content/posts/en/<slug>.mdx、public/images/posts/<slug>/
 */
import {
  constants,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";

import matter from "gray-matter";

import { type Draft, hashDraft } from "./draft.js";

export interface PostTargets {
  chinese: string;
  english: string;
  imagesDir: string;
}

/** 检出目录里这篇文章的目标路径（相对检出目录，用 / 分隔） */
export function postTargets(slug: string): PostTargets {
  return {
    chinese: `content/posts/zh/${slug}.mdx`,
    english: `content/posts/en/${slug}.mdx`,
    imagesDir: `public/images/posts/${slug}`,
  };
}

/** 提交时只提交这几个路径；没有图片就不带图片文件夹（git 不认识不存在的路径） */
export function commitPaths(draft: Draft): string[] {
  const targets = postTargets(draft.slug);
  return [
    targets.chinese,
    targets.english,
    ...(draft.images.length > 0 ? [targets.imagesDir] : []),
  ];
}

/**
 * findCollision 找到的撞车；path 是撞上的那个路径（相对检出目录）。
 * - path：同名的文章文件，或图片文件夹已经存在，换一个 slug 就能解决；
 * - translationKey：译文配对键和已有文章撞了。配对键写在两篇稿子的 frontmatter 里，
 *   只改 slug.txt 解决不了，提示要单独说。
 */
export type Collision =
  | { kind: "path"; path: string }
  | { kind: "translationKey"; key: string; path: string };

/** slug 撞了已有内容；path 是撞上的那个路径 */
export class CollisionError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`slug 撞了已有文章：${path}`);
    this.name = "CollisionError";
    this.path = path;
  }
}

/** 复制时发现稿子里的某个文件已经不在了：稿子在读出来之后被人动过 */
export class DraftChangedError extends Error {
  readonly source: string;
  constructor(source: string) {
    super(`稿子里的文件已经不在了：${source}`);
    this.name = "DraftChangedError";
    this.source = source;
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

async function listDirectory(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
}

function isPostFile(name: string): boolean {
  const extension = extname(name).toLowerCase();
  return extension === ".md" || extension === ".mdx";
}

/** 检出目录里全部文章（content/posts 下所有 .md / .mdx）的相对路径 */
async function listPostFiles(dir: string): Promise<string[]> {
  const root = join(dir, "content", "posts");
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true, recursive: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && isPostFile(entry.name))
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .sort();
}

async function readTranslationKey(file: string): Promise<string | undefined> {
  try {
    const value: unknown = matter(await readFile(file, "utf8")).data[
      "translationKey"
    ];
    return typeof value === "string" ? value.trim() : undefined;
  } catch {
    // 别人的文章读不出来是博客自己检查要管的事，这里只管有没有撞
    return undefined;
  }
}

/**
 * 撞车检查：返回撞上的是什么，没撞返回 undefined。依次看
 * 1. 两个语言目录里有没有去掉扩展名同名的 .md / .mdx；
 * 2. 全部文章里有没有相同的 translationKey；
 * 3. public/images/posts/<slug>/ 是否已存在。
 */
export async function findCollision(
  dir: string,
  draft: Draft,
): Promise<Collision | undefined> {
  const slug = draft.slug;
  for (const language of ["zh", "en"]) {
    const folder = `content/posts/${language}`;
    for (const name of await listDirectory(join(dir, folder))) {
      if (
        isPostFile(name) &&
        name.slice(0, -extname(name).length).toLowerCase() === slug
      )
        return { kind: "path", path: `${folder}/${name}` };
    }
  }

  const key = draft.chinese.translationKey.trim();
  for (const file of await listPostFiles(dir)) {
    if ((await readTranslationKey(join(dir, file))) === key)
      return { kind: "translationKey", key, path: file };
  }

  const images = postTargets(slug).imagesDir;
  if (await exists(join(dir, images)))
    return { kind: "path", path: `${images}/` };
  return undefined;
}

/**
 * 把稿子和图片复制进检出目录。只新建不覆盖：目标已存在就抛 CollisionError；
 * 稿子里的文件在复制时已经没了抛 DraftChangedError。
 */
export async function copyDraftIn(dir: string, draft: Draft): Promise<void> {
  const targets = postTargets(draft.slug);
  const copies = [
    { source: draft.chinese.file, path: targets.chinese },
    { source: draft.english.file, path: targets.english },
    ...draft.images.map((image) => ({
      source: image.source,
      path: `${targets.imagesDir}/${image.path}`,
    })),
  ];
  for (const copy of copies) {
    const target = join(dir, copy.path);
    await mkdir(dirname(target), { recursive: true });
    try {
      await copyFile(copy.source, target, constants.COPYFILE_EXCL);
    } catch (error) {
      const code = errorCode(error);
      if (code === "EEXIST") throw new CollisionError(copy.path);
      if (code === "ENOENT") throw new DraftChangedError(copy.source);
      throw error;
    }
  }
}

/**
 * 复制进检出目录的这一份稿子的指纹（算法和 hashDraft 完全一样，内容读自检出目录里的复制品）。
 * 复制的那一刻算一次，就是「后面检查、提交的究竟是哪一版」的凭据；
 * 拿它和任务文件夹里稿子的指纹比，就知道复制之后任务文件夹里的稿子动过没有。
 */
export function hashCopiedDraft(dir: string, draft: Draft): Promise<string> {
  const targets = postTargets(draft.slug);
  return hashDraft(draft, {
    chinese: join(dir, targets.chinese),
    english: join(dir, targets.english),
    imageFile: (path) => join(dir, targets.imagesDir, path),
  });
}

/** 把检出目录里排好版的两篇稿子复制回任务文件夹，覆盖原稿 */
export async function copyFormattedBack(
  dir: string,
  draft: Draft,
): Promise<void> {
  const targets = postTargets(draft.slug);
  await copyFile(join(dir, targets.chinese), draft.chinese.file);
  await copyFile(join(dir, targets.english), draft.english.file);
}

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

/**
 * 线上（检出目录）有没有这篇中文稿：
 * absent 没有；same 有且内容和任务文件夹里排好版的中文稿相同（换行符差别不算）；different 有但内容不同。
 */
export async function compareOnlinePost(
  dir: string,
  draft: Draft,
): Promise<"absent" | "same" | "different"> {
  let online: string;
  try {
    online = await readFile(join(dir, postTargets(draft.slug).chinese), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return "absent";
    throw error;
  }
  const mine = await readFile(draft.chinese.file, "utf8");
  return normalizeLineEndings(online) === normalizeLineEndings(mine)
    ? "same"
    : "different";
}
