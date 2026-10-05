/**
 * 博客的 SourceProvider：列原稿、读原稿。
 *
 * 原理：扫描 <repoPath>/<contentDir> 下的语言目录（一层子目录），
 * 语言目录里的 .md/.mdx（扩展名大小写不限）是原稿，不往更深的目录找。
 * ref 规则与真实路径安全检查见 source-refs.ts，目录扫描见 source-scan.ts，
 * 单篇读取解析见 source-load.ts；本文件只做编排。
 * 单篇出问题（元数据校验不过、读不了、同名重复）记进 issues，不中断整个列表。
 * 读单篇时 ref 不合法或文件不存在抛 SOURCE_NOT_FOUND，元数据不过抛 SOURCE_INVALID。
 */
import { realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import type {
  ParsedSource,
  SourceIssue,
  SourceListing,
  SourceSummary,
} from "../types.js";
import { LeafPressError } from "../../shared/errors.js";
import { loadSource, locateSourceFile } from "./source-load.js";
import {
  type BlogSourceProviderOptions,
  isInsideRealRoot,
  parseRef,
  sourcesRoot,
} from "./source-refs.js";
import {
  type ScannedFile,
  languageDirPath,
  readDirEntries,
  scanLanguageDir,
} from "./source-scan.js";

export type { BlogSourceProviderOptions };

/** 列表排序：publishedAt 倒序、同日按 ref 升序 */
function compareSummaries(a: SourceSummary, b: SourceSummary): number {
  const dateDiff = (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  if (dateDiff !== 0) return dateDiff;
  return a.ref.localeCompare(b.ref);
}

/** 原稿目录不存在或不是目录时统一抛 BLOG_REPO_INVALID */
async function requireRoot(root: string): Promise<string> {
  let ok = false;
  try {
    ok = (await stat(root)).isDirectory();
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new LeafPressError("BLOG_REPO_INVALID", `原稿目录不存在：${root}`, {
      hint: "请检查配置里的 blog.repoPath 和 blog.contentDir 是否正确。",
    });
  }
  try {
    return await realpath(root);
  } catch {
    throw new LeafPressError("BLOG_REPO_INVALID", `原稿目录不存在：${root}`, {
      hint: "请检查配置里的 blog.repoPath 和 blog.contentDir 是否正确。",
    });
  }
}

/** 处理扫描出的一个条目：收进列表或记问题 */
async function collectScanned(
  scanned: ScannedFile,
  langPath: string,
  langDir: string,
  realRoot: string,
  sources: SourceSummary[],
  issues: SourceIssue[],
): Promise<void> {
  if (scanned.kind === "duplicate") {
    issues.push({
      path: join(langPath, scanned.slug),
      message: `同名文件重复：${scanned.names.join("、")}`,
    });
    return;
  }
  const filePath = join(langPath, scanned.name);
  const ref = `${langDir}/${scanned.slug}`;
  // 真实路径在原稿目录外（符号链接引出去）的文件：跳过并记问题；
  // 指向目录内的符号链接文件在这里照常收录
  if (!(await isInsideRealRoot(filePath, realRoot))) {
    issues.push({
      path: filePath,
      message: "真实路径不在原稿目录内（可能是指向目录外的符号链接），已跳过",
    });
    return;
  }
  const loaded = await loadSource(filePath, ref);
  if (loaded.ok) {
    sources.push(loaded.loaded.summary);
  } else {
    issues.push({ path: filePath, message: loaded.message });
  }
}

/**
 * 列出全部语言目录的原稿。
 * 原稿目录本身不存在时抛 BLOG_REPO_INVALID。
 */
export async function listBlogSources(
  options: BlogSourceProviderOptions,
): Promise<SourceListing> {
  const root = sourcesRoot(options);
  const realRoot = await requireRoot(root);

  // 语言目录 = 原稿目录下的一层子目录，按名字排序保证结果稳定；
  // 原稿根目录读不了抛 BLOG_REPO_INVALID（stat 已过但 readdir 仍可能失败，如权限）
  const rootEntries = await readDirEntries(root);
  if (rootEntries === undefined) {
    throw new LeafPressError("BLOG_REPO_INVALID", `原稿目录读不了：${root}`, {
      hint: "请检查目录权限，或磁盘是否可用。",
    });
  }
  const langDirs = rootEntries
    .filter((entry) => entry.isFile === false)
    .map((entry) => entry.name)
    .sort();

  const sources: SourceSummary[] = [];
  const issues: SourceIssue[] = [];

  for (const langDir of langDirs) {
    const langPath = languageDirPath(root, langDir);
    // 某个语言目录读不了：记一条问题，其余语言目录照常
    const files = await readDirEntries(langPath);
    if (files === undefined) {
      issues.push({
        path: langPath,
        message: `语言目录读不了：${langPath}`,
      });
      continue;
    }
    const scannedList = scanLanguageDir(langPath, files);
    for (const scanned of scannedList) {
      await collectScanned(
        scanned,
        langPath,
        langDir,
        realRoot,
        sources,
        issues,
      );
    }
  }

  sources.sort(compareSummaries);
  return { sources, issues };
}

/**
 * 按 ref 读一篇完整原稿。
 * ref 不合法、路径越界、文件不存在都抛 SOURCE_NOT_FOUND；
 * 元数据校验不过抛 SOURCE_INVALID。
 */
export async function readBlogSource(
  options: BlogSourceProviderOptions,
  ref: string,
): Promise<ParsedSource> {
  const root = sourcesRoot(options);
  const parsed = parseRef(ref);
  if (parsed === undefined) {
    throw new LeafPressError("SOURCE_NOT_FOUND", `原稿定位不合法：${ref}`, {
      hint: "ref 应形如 zh/claude-code-rules：一个语言目录加文件名（不含扩展名）。",
    });
  }

  // 扫描语言目录找实际文件（大小写敏感匹配 slug，扩展名大小写不限）
  const foundPaths = await locateSourceFile(root, parsed.langDir, parsed.slug);
  // 同一 slug 有 .mdx 和 .md 时 .mdx 优先（只有扩展名大小写不同的对已被 list 判重，这里不会出现）
  const filePath =
    foundPaths.find((p) => p.toLowerCase().endsWith(".mdx")) ?? foundPaths[0];
  if (filePath === undefined) {
    throw new LeafPressError("SOURCE_NOT_FOUND", `找不到原稿：${ref}`, {
      hint: `在 ${root} 下没有 ${ref}.mdx 或 ${ref}.md。`,
    });
  }

  // 真实路径必须仍在原稿目录的真实路径之内（防符号链接把读取引到目录外）
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    throw new LeafPressError("SOURCE_NOT_FOUND", `找不到原稿：${ref}`, {
      hint: `原稿目录 ${root} 不存在或不可访问。`,
    });
  }
  if (!(await isInsideRealRoot(filePath, realRoot))) {
    throw new LeafPressError(
      "SOURCE_NOT_FOUND",
      `原稿 ${ref} 的真实路径不在原稿目录内（可能是指向目录外的符号链接）`,
      { hint: "请检查文件是否为指向原稿目录外的符号链接。" },
    );
  }

  const loaded = await loadSource(filePath, ref);
  if (!loaded.ok) {
    throw new LeafPressError(
      "SOURCE_INVALID",
      `原稿 ${ref} 有问题：${loaded.message}`,
      { hint: "请修复文件头部元数据后再试。" },
    );
  }
  return loaded.loaded.parsed;
}

/** 博客的列读函数集合：adapter 层把它和 git 拉取拼成 SourceProvider */
export interface BlogSourceReader {
  list(): Promise<SourceListing>;
  read(ref: string): Promise<ParsedSource>;
}

/** 博客的列、读实现 */
export function createBlogSourceReader(
  options: BlogSourceProviderOptions,
): BlogSourceReader {
  return {
    list(): Promise<SourceListing> {
      return listBlogSources(options);
    },
    read(ref: string): Promise<ParsedSource> {
      return readBlogSource(options, ref);
    },
  };
}
