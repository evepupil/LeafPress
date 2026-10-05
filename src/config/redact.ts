/**
 * 抹密钥：把文本里出现的密钥值统统替换成 <redacted>。
 *
 * 用于打印路径、报错、日志前先过一遍，防止密钥跟着输出泄漏。
 * 先替换长的再替换短的：避免短密钥先替换掉长密钥的一部分、留下残片。
 */

/** 密钥最短长度；比这短的忽略（替换了也没意义，误伤还多） */
const MIN_SECRET_LENGTH = 4;

export function redactSecrets(
  text: string,
  secrets: readonly string[],
): string {
  // 去重、过滤掉空串和短于 4 的，再按长度从长到短排
  const unique = [...new Set(secrets)]
    .filter((s) => s.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length);

  let result = text;
  for (const secret of unique) {
    //replaceAll 全量替换，密钥里的特殊字符按字面处理（换成分隔符形式的正则反而多余）
    result = result.split(secret).join("<redacted>");
  }
  return result;
}
