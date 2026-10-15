/**
 * 解析卡片稿（卡片.md）：拆页、逐条检查规格，全部问题一次报出。
 *
 * 格式（规格《平台适配 · 小红书》「卡片稿 卡片.md 的格式」）：
 * - 页与页之间用单独一行 `---` 分开；
 * - 第一页是封面，以 `# ` 开头：一句 ≤18 字，可选一行副标题 ≤24 字；
 * - 最后一页是总结页，标题以「总结」开头；
 * - 其余是要点页，以 `## ` 开头；标记后必须有一个空格，`#封面`、`##要点` 不算标题行；
 *   要点、总结页除标题外至少要有一条非空内容，只有标题会出一张空卡片；
 * - 页数 3～18；要点、总结页的标题 ≤16 字，每页 ≤5 条，正文合计 ≤120 字。
 *
 * 结构错了（标题行不对、行不是 `- ` 开头）也继续往下查：一次把所有问题列出来，
 * 写稿的 AI 一回全改掉，不用改一条重跑一次。
 */
import type { CardDeckResult, CardPage } from "./types.js";

/** 各处的字数上限；字数按字符算（一个汉字、一个英文字母都是 1），空白不算 */
const LIMITS = {
  pagesMin: 3,
  pagesMax: 18,
  coverTitle: 18,
  coverSubtitle: 24,
  pageTitle: 16,
  linesPerPage: 5,
  bodyPerPage: 120,
} as const;

/** 字数按字符算（一个汉字、一个英文字母都是 1），空白不算；导出给测试用 */
export function charCount(text: string): number {
  // for..of 按码点走，emoji 这类代理对算 1 个字符
  return Array.from(text.replace(/\s/g, "")).length;
}

/** 按单独一行 `---` 拆页；整页空白（分隔线连写、结尾多敲的回车）不算一页 */
function splitPages(text: string): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "---") {
      pages.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  pages.push(current);
  return pages.map(trimBlankLines).filter((lines) => lines.length > 0);
}

/** 去掉一页开头结尾的空行 */
function trimBlankLines(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() !== "");
  if (start === -1) return [];
  const end = lines.findLastIndex((line) => line.trim() !== "");
  return lines.slice(start, end + 1);
}

/**
 * 标题行：`# 标题`、`## 标题`（标记后面必须有一个空格，`#封面`、`##要点` 这种
 * 按格式要求不算标题行）；对不上返回 undefined。
 */
function headingText(line: string, marks: string): string | undefined {
  // `\s+` 要求标记后至少一个空白，同时不吃掉 `### ` 这种多一级的标记（它会被当普通文字，由后面的检查报出来）
  const match = new RegExp(`^${marks}\\s+(.*)$`).exec(line);
  return match?.[1]?.trim();
}

/** 标题行对不上时，退而求其次拿这行文字（去掉 # 记号）继续查字数 */
function fallbackTitle(line: string): string {
  return line.replace(/^#+\s*/, "").trim();
}

/** 解析封面页：一句 + 可选一行副标题 */
function parseCover(lines: string[], errors: string[]): CardPage {
  const first = lines[0] ?? "";
  const title = headingText(first, "#");
  if (title === undefined) {
    errors.push(`缺封面：第 1 页要以「# 」开头（现在是「${first}」）`);
  }
  const heading = title ?? fallbackTitle(first);
  const rest = lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rest.length > 1) {
    errors.push(
      `封面除了主句最多再有一行副标题，现在多了 ${rest.length - 1} 行`,
    );
  }
  if (heading === "") {
    errors.push("封面这句是空的");
  } else if (charCount(heading) > LIMITS.coverTitle) {
    errors.push(
      `封面这句 ${charCount(heading)} 字，超过 ${LIMITS.coverTitle} 字：「${heading}」`,
    );
  }
  const subtitle = rest[0] ?? "";
  if (subtitle !== "" && charCount(subtitle) > LIMITS.coverSubtitle) {
    errors.push(
      `封面副标题 ${charCount(subtitle)} 字，超过 ${LIMITS.coverSubtitle} 字：「${subtitle}」`,
    );
  }
  return {
    kind: "cover",
    title: heading,
    lines: subtitle === "" ? [] : [subtitle],
  };
}

/** 解析要点页或总结页：标题 + 若干条 `- ` 开头的行 */
function parseContentPage(
  lines: string[],
  pageNo: number,
  isSummary: boolean,
  errors: string[],
): CardPage {
  const first = lines[0] ?? "";
  const title = headingText(first, "##");
  if (title === undefined) {
    errors.push(
      isSummary
        ? `缺总结：最后一页要以「## 」开头（现在是「${first}」）`
        : `第 ${pageNo} 页要以「## 」开头（现在是「${first}」）`,
    );
  }
  const heading = title ?? fallbackTitle(first);
  if (isSummary && heading !== "" && !heading.startsWith("总结")) {
    errors.push(`缺总结：最后一页的标题要以「总结」开头，现在是「${heading}」`);
  }
  if (heading === "") {
    errors.push(`第 ${pageNo} 页的标题是空的`);
  } else if (charCount(heading) > LIMITS.pageTitle) {
    errors.push(
      `第 ${pageNo} 页的标题 ${charCount(heading)} 字，超过 ${LIMITS.pageTitle} 字：「${heading}」`,
    );
  }

  const items: string[] = [];
  let bodyChars = 0;
  lines.slice(1).forEach((line, index) => {
    const bullet = /^\s*-\s+(.*)$/.exec(line);
    if (!bullet) {
      errors.push(
        `第 ${pageNo} 页第 ${index + 2} 行不是「- 」开头的要点：「${line.trim()}」`,
      );
    }
    const text = (bullet?.[1] ?? line).trim();
    items.push(text);
    bodyChars += charCount(text);
  });
  if (items.length > LIMITS.linesPerPage) {
    errors.push(
      `第 ${pageNo} 页有 ${items.length} 条，最多 ${LIMITS.linesPerPage} 条`,
    );
  }
  // 要点页、总结页至少要有一条非空内容：只有标题的页会出一张空卡片
  if (items.filter((item) => item !== "").length === 0) {
    errors.push(
      isSummary
        ? `缺总结：最后一页至少要有一条内容，现在只有标题`
        : `第 ${pageNo} 页至少要有一条内容，现在只有标题`,
    );
  }
  if (bodyChars > LIMITS.bodyPerPage) {
    errors.push(
      `第 ${pageNo} 页正文合计 ${bodyChars} 字，超过 ${LIMITS.bodyPerPage} 字`,
    );
  }
  return {
    kind: isSummary ? "summary" : "point",
    title: heading,
    lines: items,
  };
}

/** 解析并检查卡片稿：合格返回卡片组，不合格把每一条问题都列出来 */
export function parseCardDeck(text: string): CardDeckResult {
  const errors: string[] = [];
  const pages = splitPages(text);
  if (pages.length === 0) {
    return { ok: false, errors: ["卡片稿是空的"] };
  }
  if (pages.length < LIMITS.pagesMin || pages.length > LIMITS.pagesMax) {
    errors.push(
      `页数不对：现在 ${pages.length} 页，要 ${LIMITS.pagesMin}～${LIMITS.pagesMax} 页（封面 1 张 + 要点页 + 总结 1 张）`,
    );
  }

  // 第 1 页当封面、最后一页当总结检查；只有 1 页时它当封面查，不再两头都查
  // （页数不够的错误已经在前面报了）
  const deck: CardPage[] = [];
  pages.forEach((lines, index) => {
    const pageNo = index + 1;
    if (index === 0) {
      deck.push(parseCover(lines, errors));
      return;
    }
    deck.push(
      parseContentPage(lines, pageNo, index === pages.length - 1, errors),
    );
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, deck: { pages: deck } };
}
