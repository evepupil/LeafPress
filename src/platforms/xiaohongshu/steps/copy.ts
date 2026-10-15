/**
 * 解析笔记文案（文案.md）：摘出标题、正文、话题标签，并逐条检查规格。
 *
 * 规格（docs/模块设计/平台适配-小红书.md）：
 * - 第一行 `# 标题`，标题 20 字以内；
 * - 正文合计 1000 字以内；
 * - 最后一行是 3～8 个话题标签，`#话题` 用空格分开：按空白拆开后每一段都必须以
 *   `#` 开头且 `#` 后面不空（`#甲 乙 #丙` 里「乙」不是标签，不算合格的标签行）；
 * - 全文（标题、正文、标签）不能出现 `http`：小红书里外链点不了，还可能被判违规。
 */

const LIMITS = { title: 20, body: 1000, tagsMin: 3, tagsMax: 8 } as const;

/** 文案稿的解析结果 */
export interface CopyDraft {
  /** 第一行 `# 标题` 里的标题 */
  title: string;
  /** 正文（标题行、标签行都去掉，空行压掉） */
  body: string;
  /** 最后一行的话题标签，不带 `#` */
  tags: string[];
}

/** 解析并检查文案稿：合格返回稿子，不合格把每一条问题都列出来 */
export function parseCopy(text: string): CopyDeckResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  const rest = trimBlankLines(lines);

  if (rest.length === 0) {
    return { ok: false, errors: ["文案是空的"] };
  }

  const first = rest[0] ?? "";
  const heading = /^#\s+(.*)$/.exec(first);
  if (!heading) {
    errors.push(`第一行要是「# 标题」，现在是「${first}」`);
  }
  const title = heading?.[1]?.trim() ?? fallbackTitle(first);
  if (title === "") {
    errors.push("标题是空的");
  } else if (charCount(title) > LIMITS.title) {
    errors.push(
      `标题 ${charCount(title)} 字，超过 ${LIMITS.title} 字：「${title}」`,
    );
  }

  // 标签行：最后一行按空白拆开后每一段都得是 `#话题`（# 开头且后面不空）；
  // 正文是标题和标签行之间的部分
  const last = rest[rest.length - 1] ?? "";
  const segments = last.split(/\s+/).filter(Boolean);
  const isTagLine =
    segments.length > 0 && segments.every((segment) => /^#[^\s]/.test(segment));
  const tagLine = isTagLine ? last : "";
  // 每段去掉开头的连续 # 才是话题名；上面已保证 # 后面不空，不会出空标签
  const tags = isTagLine
    ? segments.map((segment) => segment.replace(/^#+/, ""))
    : [];
  if (tagLine === "") {
    errors.push(
      `最后一行要写 3～8 个话题标签（#话题 用空格分开），现在是「${last}」`,
    );
  } else if (tags.length < LIMITS.tagsMin || tags.length > LIMITS.tagsMax) {
    errors.push(
      `话题标签 ${tags.length} 个，要 ${LIMITS.tagsMin}～${LIMITS.tagsMax} 个`,
    );
  }
  const badTags = tags.filter((tag) => tag === "");
  if (badTags.length > 0) {
    errors.push("有空的标签");
  }

  const bodyLines = rest.slice(1, tagLine === "" ? rest.length : -1);
  const body = bodyLines.join("\n").trim();
  if (charCount(body) > LIMITS.body) {
    errors.push(`正文合计 ${charCount(body)} 字，超过 ${LIMITS.body} 字`);
  }

  if (text.toLowerCase().includes("http")) {
    errors.push("文案里不能出现 http 链接：小红书里点不了，也可能被判违规");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, draft: { title, body, tags } };
}

/** 文案检查结果：和卡片稿的 CardDeckResult 同一个形状，不合格时逐条报出 */
export type CopyDeckResult =
  { ok: true; draft: CopyDraft } | { ok: false; errors: string[] };

/** 字数按字符算（一个汉字、一个英文字母都是 1），空白不算；和卡片稿的算法一致 */
function charCount(text: string): number {
  return Array.from(text.replace(/\s/g, "")).length;
}

function trimBlankLines(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() !== "");
  if (start === -1) return [];
  const end = lines.findLastIndex((line) => line.trim() !== "");
  return lines.slice(start, end + 1);
}

/** 第一行不是 `# 标题` 时，退而求其次拿这行文字继续查字数 */
function fallbackTitle(line: string): string {
  return line.replace(/^#+\s*/, "").trim();
}
