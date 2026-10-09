/**
 * 子进程输出的解码：先按 UTF-8 严格解码，不是合法 UTF-8 再按 GB18030 解码。
 *
 * 原因：多数工具（git、node）输出 UTF-8，但 Windows 上 cmd.exe 自己的提示
 * （例如找不到 pnpm 时的「'pnpm' 不是内部或外部命令」）按系统代码页输出，
 * 中文系统是 936（GBK）。一律按 UTF-8 解会得到乱码，写进检查结果和失败信息就没法看了。
 * 「严格」是指遇到非法字节直接判定不是 UTF-8，而不是悄悄换成替换字符（U+FFFD）。
 * GB18030 是 GBK 的超集，Node 自带完整的字符集数据（ICU），TextDecoder 可以直接解。
 */
export function decodeOutput(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  try {
    // 保留开头的 BOM（ignoreBOM），和原来 Buffer.toString("utf8") 的行为一致
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}
