/** 命令行文本输出：显示宽度、截断、表格和 JSON。 */

/** 终端里按两列显示的字符范围，覆盖中日韩、全角符号及常用 emoji。 */
function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

const ZERO_WIDTH = /[\p{M}\p{Cf}\p{Emoji_Modifier}]/u;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemeWidth(value: string): number {
  let width = 0;
  let emojiPresentation = false;
  let emojiVariation = false;
  let regionalIndicators = 0;
  let hasVisibleBase = false;

  for (const character of value) {
    if (character === "\uFE0F") {
      emojiVariation ||= hasVisibleBase;
      continue;
    }
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 0 ||
      codePoint < 0x20 ||
      (codePoint >= 0x7f && codePoint < 0xa0) ||
      ZERO_WIDTH.test(character)
    ) {
      continue;
    }
    hasVisibleBase = true;
    emojiPresentation ||= EMOJI_PRESENTATION.test(character);
    if (REGIONAL_INDICATOR.test(character)) regionalIndicators += 1;
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }

  return emojiPresentation || emojiVariation || regionalIndicators > 1
    ? 2
    : width;
}

/** 计算终端显示列数；汉字、全角字符和 emoji 按两列计算。 */
export function displayWidth(value: string): number {
  let width = 0;
  for (const { segment } of SEGMENTER.segment(value)) {
    width += graphemeWidth(segment);
  }
  return width;
}

/** 按终端列数截断字符串；空间足够时原样返回，截断后追加省略号。 */
export function truncateByWidth(value: string, maxWidth: number): string {
  if (displayWidth(value) <= maxWidth) return value;
  const ellipsis = "…";
  const ellipsisWidth = displayWidth(ellipsis);
  if (maxWidth < ellipsisWidth) return "";

  const available = maxWidth - ellipsisWidth;
  let result = "";
  let width = 0;
  for (const { segment } of SEGMENTER.segment(value)) {
    const segmentWidth = graphemeWidth(segment);
    if (width + segmentWidth > available) break;
    result += segment;
    width += segmentWidth;
  }
  return `${result}${ellipsis}`;
}

/** 生成按显示宽度对齐的纯文本表格。 */
export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const columnCount = headers.length;
  const widths = headers.map((header, index) =>
    Math.max(
      displayWidth(header),
      ...rows.map((row) => displayWidth(row[index] ?? "")),
    ),
  );
  const renderRow = (row: readonly string[]): string =>
    widths
      .map((width, index) => {
        const value = row[index] ?? "";
        const isLast = index === columnCount - 1;
        return isLast
          ? value
          : value + " ".repeat(width - displayWidth(value) + 2);
      })
      .join("");

  if (columnCount === 0) return "";
  return [renderRow(headers), ...rows.map(renderRow)].join("\n");
}

/** 输出稳定缩进的 JSON 文本。 */
export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** 统一命令错误输出，JSON 模式下不会把异常堆栈写入 stdout。 */
export function renderError(
  error: { code: string; message: string; hint?: string | undefined },
  json: boolean,
): string {
  if (json) {
    return renderJson({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.hint === undefined ? {} : { hint: error.hint }),
      },
    });
  }
  return [
    `错误：${error.message}`,
    ...(error.hint === undefined ? [] : [`提示：${error.hint}`]),
  ].join("\n");
}

/** 命令成功结果统一加 ok 标记；已有 ok 字段的结果（doctor）保持原样。 */
export function renderSuccessJson(result: object): string {
  if ("ok" in result) return renderJson(result);
  return renderJson({ ok: true, ...result });
}
