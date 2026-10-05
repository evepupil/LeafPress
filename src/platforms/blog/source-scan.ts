/**
 * 目录扫描：找出语言目录里的原稿文件。
 *
 * 原理：语言目录是原稿目录下的一层子目录；目录里扩展名为 .md/.mdx
 * （不区分大小写）的条目是原稿文件。同名按大小写不敏感分组：
 * guide.md 与 GUIDE.mdx 算同名重复。符号链接条目不在这里下结论，
 * 交给真实路径检查（见 source-refs.isInsideRealRoot）。
 */
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

/** 原稿扩展名（小写形式）：语言目录下的文件按这个认 */
export const SOURCE_EXTENSIONS = [".mdx", ".md"] as const;

/** 扫描语言目录后的一类文件：去重后的结果或重复说明 */
export type ScannedFile =
  | { kind: "single"; name: string; slug: string }
  | { kind: "duplicate"; slug: string; names: string[] };

/** 扩展名是否是原稿扩展名（大小写不敏感） */
export function isSourceExtension(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase();
  return (SOURCE_EXTENSIONS as readonly string[]).includes(ext);
}

/** 文件名去掉扩展名后的 slug */
export function slugOf(fileName: string): string {
  return fileName.slice(0, fileName.length - extname(fileName).length);
}

/**
 * 把一个语言目录的文件条目分组成扫描结果。
 * 去重键是「slug 的小写」：guide.md 与 GUIDE.mdx 撞车，两个都不收；
 * 同一 slug 出现两次以上也照样整组判重。
 */
export function scanLanguageDir(
  dirPath: string,
  entries: Array<{ name: string; isFile: boolean; isSymbolicLink: boolean }>,
): ScannedFile[] {
  const bySlug = new Map<string, string[]>();
  for (const entry of entries) {
    // 目录和无关文件不要；符号链接（文件或目录）保留，让真实路径检查定夺
    if (!entry.isFile && !entry.isSymbolicLink) continue;
    if (!isSourceExtension(entry.name)) continue;
    const slug = slugOf(entry.name);
    if (slug === "" || slug === "." || slug === "..") continue;
    const key = slug.toLowerCase();
    const list = bySlug.get(key);
    if (list === undefined) {
      bySlug.set(key, [entry.name]);
    } else {
      list.push(entry.name);
    }
  }

  const result: ScannedFile[] = [];
  for (const key of [...bySlug.keys()].sort()) {
    const names = bySlug.get(key);
    if (names === undefined || names.length === 0) continue;
    if (names.length > 1) {
      result.push({
        kind: "duplicate",
        slug: slugOf(names[0] ?? key),
        names,
      });
      continue;
    }
    const name = names[0];
    if (name === undefined) continue;
    result.push({ kind: "single", name, slug: slugOf(name) });
  }
  return result;
}

/** 读语言目录的条目（带类型信息）；目录读不了返回 undefined */
export async function readDirEntries(
  dirPath: string,
): Promise<
  Array<{ name: string; isFile: boolean; isSymbolicLink: boolean }> | undefined
> {
  try {
    const dirents = await readdir(dirPath, { withFileTypes: true });
    return dirents.map((d) => ({
      name: d.name,
      isFile: d.isFile(),
      isSymbolicLink: d.isSymbolicLink(),
    }));
  } catch {
    return undefined;
  }
}

/** 语言目录的绝对路径 */
export function languageDirPath(root: string, langDir: string): string {
  return join(root, langDir);
}
