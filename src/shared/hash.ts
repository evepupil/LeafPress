/**
 * 内容哈希：原稿、资产、工作流步骤的输入文件都靠它判断「有没有变」。
 * 统一用 sha256 十六进制串。
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** 文件不存在时，用这个固定值表示「缺失」，好和任何真实哈希区分开 */
export const ABSENT_HASH = "absent";

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 读文件算哈希；文件不存在返回 ABSENT_HASH，其他读取错误照常抛出 */
export async function sha256File(path: string): Promise<string> {
  try {
    return sha256(await readFile(path));
  } catch (error) {
    if (isNotFound(error)) {
      return ABSENT_HASH;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
