/**
 * 单篇原稿的读取与解析：读文件 → 切 frontmatter → 校验元数据 → 分析正文。
 *
 * 原理：YAML 用 js-yaml 的 JSON_SCHEMA 解（不加引号的日期保持字符串，
 * 不会被默认引擎转成日期对象——那种转换会把 2026-02-31 悄悄变成 2026-03-03）。
 * 任何一步出错都返回 { ok: false, message }，由调用方决定记问题还是抛错。
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import yaml from "js-yaml";
import matter from "gray-matter";

import type { ParsedSource, SourceSummary } from "./types.js";
import { analyzeBody } from "./body.js";
import { parseFrontmatter } from "./frontmatter.js";
import { isSourceExtension, slugOf } from "./source-scan.js";

/**
 * 切开 frontmatter 并解析 YAML。
 */
function parseMatter(text: string): matter.GrayMatterFile<string> {
  return matter(text, {
    engines: {
      yaml: (s: string) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
    },
  });
}

/** 单篇原稿文件：读内容 + 解析 frontmatter + 分析正文 */
export interface LoadedSource {
  summary: SourceSummary;
  parsed: ParsedSource;
}

/** 读一个原稿文件并解析；任何一步出错都返回问题说明 */
export async function loadSource(
  filePath: string,
  ref: string,
): Promise<
  { ok: true; loaded: LoadedSource } | { ok: false; message: string }
> {
  let raw: Buffer;
  try {
    raw = await readFile(filePath);
  } catch (error) {
    return {
      ok: false,
      message: `读不了文件：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let matterResult: matter.GrayMatterFile<string>;
  try {
    matterResult = parseMatter(raw.toString("utf8"));
  } catch (error) {
    return {
      ok: false,
      message: `解析头部元数据失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const front = parseFrontmatter(matterResult.data);
  if (!front.ok) {
    return { ok: false, message: front.message };
  }

  const body = matterResult.content;
  const analysis = analyzeBody(body);
  const contentHash = createHash("sha256").update(raw).digest("hex");

  const summary: SourceSummary = {
    ref,
    title: front.meta.title,
    locale: front.meta.locale,
    publishedAt: front.meta.publishedAt,
    updatedAt: front.meta.updatedAt,
    tags: front.meta.tags,
    draft: front.meta.draft,
    translationKey: front.meta.translationKey,
    origin: front.meta.origin,
    contentHash,
    path: resolve(filePath),
  };

  return {
    ok: true,
    loaded: {
      summary,
      parsed: {
        ...summary,
        description: front.meta.description,
        body,
        images: analysis.images,
        mermaidBlockCount: analysis.mermaidBlockCount,
        internalLinks: analysis.internalLinks,
        frontmatter: matterResult.data,
      },
    },
  };
}

/**
 * 找 ref 对应的实际文件：扫描语言目录，按「文件名去掉扩展名后与 slug 完全相同（区分大小写）」匹配。
 * 大写扩展名（post.MDX）、大小写不同的同名对都靠实际扫描解决，不拼路径探测。
 * 返回全部匹配（可能 .mdx/.md 各一个，调用方按 .mdx 优先取）。
 */
export async function locateSourceFile(
  root: string,
  langDir: string,
  slug: string,
): Promise<string[]> {
  const langPath = join(root, langDir);
  let names: string[];
  try {
    names = (await readdir(langPath)).sort();
  } catch {
    return [];
  }
  const matches: string[] = [];
  for (const name of names) {
    if (!isSourceExtension(name)) continue;
    if (slugOf(name) !== slug) continue;
    const candidate = resolve(langPath, name);
    try {
      const fileStat = await stat(candidate);
      if (fileStat.isFile() || fileStat.isSymbolicLink())
        matches.push(candidate);
    } catch {
      // 悬空链接等：跳过
    }
  }
  return matches;
}
