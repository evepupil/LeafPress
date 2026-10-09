/**
 * 归档链接（archive）：从当前反馈或最近一条历史反馈里找知乎链接，规范化后归档到作品上。
 *
 * 和通用归档（general/archive.ts）同样的取法，只是认得知乎的两种链接、会按工作流挑类型：
 * - 文章：`zhuanlan.zhihu.com/p/<数字>` → `https://zhuanlan.zhihu.com/p/<数字>`，sourceRef = `zhihu/article/<数字>`；
 * - 回答：`www.zhihu.com/question/<数字>/answer/<数字>` 或短格式 `www.zhihu.com/answer/<数字>`
 *   → 规范化地址，sourceRef = `zhihu/answer/<数字>`。
 *
 * 回答问题工作流只认回答链接，另两条只认文章链接；找的时候按工作流要的类型挑第一条
 * 对得上的（前面类型不对的链接跳过），一条都没有才转成要作者处理。
 *
 * 链接后面必须直接是结尾、/、?、# 或非链接字符（空格、中文等）：/p/123abc 不算文章链接，
 * 编号被截断会对不上原稿；链接后面粘着的标点去掉再判。查询串一律不要。
 */
import type { CodeOutcome } from "@leafpress/core";

import type { CodeStepContext } from "../../types.js";

/** 从反馈里找出来的链接：是哪种、规范化地址、sourceRef */
interface ZhihuLink {
  kind: "article" | "answer";
  url: string;
  sourceRef: string;
}

/**
 * 在反馈里找知乎链接。直接匹配链接本身（不是按空格切词再认），三种形态：
 * 1 是完整回答链接，2 是短回答链接，3 是文章链接。编号后面用负向断言挡住
 * /p/123abc 这种（编号被截断会对不上原稿）；后面粘着的标点、中文不影响匹配。
 */
const ID_BOUNDARY = "(?![0-9a-zA-Z])";
const LINK_RE = new RegExp(
  [
    `(?:https?:\\/\\/)?(?:www\\.)?zhihu\\.com\\/question\\/(\\d+)\\/answer\\/(\\d+)${ID_BOUNDARY}`,
    `(?:https?:\\/\\/)?(?:www\\.)?zhihu\\.com\\/answer\\/(\\d+)${ID_BOUNDARY}`,
    `(?:https?:\\/\\/)?zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)${ID_BOUNDARY}`,
  ].join("|"),
  "gi",
);

/** 一处匹配归成哪种链接；编号后跟字母的会被负向断言挡掉，不进 matchAll 结果 */
function linkOf(match: RegExpMatchArray): ZhihuLink | undefined {
  const [, full1, full2, short, article] = match;
  if (full1 !== undefined && full2 !== undefined) {
    return {
      kind: "answer",
      url: `https://www.zhihu.com/question/${full1}/answer/${full2}`,
      sourceRef: `zhihu/answer/${full2}`,
    };
  }
  if (short !== undefined) {
    return {
      kind: "answer",
      url: `https://www.zhihu.com/answer/${short}`,
      sourceRef: `zhihu/answer/${short}`,
    };
  }
  if (article !== undefined) {
    return {
      kind: "article",
      url: `https://zhuanlan.zhihu.com/p/${article}`,
      sourceRef: `zhihu/article/${article}`,
    };
  }
  return undefined;
}

/**
 * 从反馈文字里找第一条给定类型的知乎链接。按类型找：回答工作流跳过前面的文章链接，
 * 反之亦然；类型不对的链接不当数。
 */
function findLink(feedback: string, kind: "article" | "answer"): ZhihuLink {
  for (const match of feedback.matchAll(LINK_RE)) {
    const link = linkOf(match);
    if (link && link.kind === kind) return link;
  }
  return { kind, url: "", sourceRef: "" };
}

/** 没找到链接时给作者的话 */
function askText(kind: "article" | "answer"): string {
  return kind === "answer"
    ? "没找到知乎回答链接（形如 https://www.zhihu.com/question/…/answer/…）。发完把链接填在下面；还没发就先去发。"
    : "没找到知乎文章链接（形如 https://zhuanlan.zhihu.com/p/…）。发完把链接填在下面；还没发就先去发。";
}

/** 归档知乎链接 */
export async function archiveZhihuLink(
  ctx: CodeStepContext,
): Promise<CodeOutcome> {
  const wanted: "article" | "answer" =
    ctx.workflow.id === "zhihu-answer" ? "answer" : "article";
  const feedback =
    ctx.work.feedback ?? ctx.work.feedbackHistory.at(-1)?.text ?? "";
  const link = findLink(feedback, wanted);

  if (link.url) {
    return {
      kind: "done",
      url: link.url,
      publishedAt: ctx.today,
      sourceRef: link.sourceRef,
    };
  }
  await Promise.resolve();
  return { kind: "ask", ask: askText(wanted) };
}
