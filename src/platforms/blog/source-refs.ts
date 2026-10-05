/**
 * 原稿 ref 规则与路径安全检查。
 *
 * 原理：ref 由语言目录段和文件名段（不含扩展名）组成，如 zh/claude-code-rules。
 * 语言目录段只允许字母、数字、下划线、连字符（"." 和 ".." 自然被拒）；
 * 解析后的路径必须落在原稿目录内（防目录穿越）；
 * 符号链接逃逸按真实路径判断：fs.realpath 后仍要落在原稿目录的真实路径之内。
 */
import { realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/** 博客原稿提供者选项：仓库路径加仓库内的原稿目录 */
export interface BlogSourceProviderOptions {
  repoPath: string;
  contentDir: string;
}

/** 原稿目录的绝对路径 */
export function sourcesRoot(options: BlogSourceProviderOptions): string {
  return resolve(join(options.repoPath, options.contentDir));
}

/** 语言目录段规则：字母、数字、下划线、连字符，至少一个字符 */
const LANG_DIR_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 文件名段（不含扩展名）规则：非空，且不是纯点段 */
function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug !== "." && slug !== "..";
}

/** 解析后的 ref：语言目录段加文件名段 */
export interface ParsedRef {
  langDir: string;
  slug: string;
}

/**
 * 解析 ref；不合法返回 undefined。
 * 不合法的情形：含反斜杠、段数不是 2、语言目录段带特殊字符或是点段、文件名段为空或点段。
 */
export function parseRef(ref: string): ParsedRef | undefined {
  if (ref.includes("\\")) return undefined;
  const parts = ref.split("/");
  if (parts.length !== 2) return undefined;
  const [langDir, slug] = parts as [string, string];
  if (!LANG_DIR_PATTERN.test(langDir)) return undefined;
  if (!isValidSlug(slug)) return undefined;
  return { langDir, slug };
}

/**
 * 把解析后的 ref 约束回原稿目录：resolve 后必须落在 root 里面。
 * 防住 zh/../../x 这类穿越（尽管 parseRef 已拒掉大部分）。
 */
export function refPathInsideRoot(parsed: ParsedRef, root: string): boolean {
  const resolved = resolve(root, parsed.langDir, parsed.slug);
  return resolved === root || resolved.startsWith(root + sep);
}

/**
 * 用 fs.realpath 取真实路径，检查是否仍在原稿目录的真实路径之内。
 * 原理：符号链接可以把文件引到目录外，字面路径检查拦不住，必须看真实路径。
 * 任一头取真实路径失败（文件或目录被删、链接断掉）都算不在里面。
 */
export async function isInsideRealRoot(
  filePath: string,
  realRoot: string,
): Promise<boolean> {
  try {
    const realFile = await realpath(filePath);
    return realFile === realRoot || realFile.startsWith(realRoot + sep);
  } catch {
    return false;
  }
}
