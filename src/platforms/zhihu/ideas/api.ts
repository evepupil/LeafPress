import { questionIdOf } from "@leafpress/core";
import type { ZhihuClient } from "../api/client.js";

export { questionIdOf as questionIdOfUrl } from "@leafpress/core";

export interface ZhihuQuestionItem {
  questionId: string;
  title: string;
  url: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizedQuestion(
  title: unknown,
  rawUrl: unknown,
): ZhihuQuestionItem | undefined {
  if (typeof rawUrl !== "string") return undefined;
  const questionId = questionIdOf(rawUrl);
  if (questionId === undefined) return undefined;
  return {
    questionId,
    title: typeof title === "string" ? title : "",
    url: `https://www.zhihu.com/question/${questionId}`,
  };
}

function itemsOf(payload: unknown): unknown[] {
  const data = record(payload);
  const items = data?.["Items"];
  return Array.isArray(items) ? items : [];
}

function questionItemsOf(payload: unknown): ZhihuQuestionItem[] {
  const result: ZhihuQuestionItem[] = [];
  for (const value of itemsOf(payload)) {
    const item = record(value);
    const question = normalizedQuestion(item?.["Title"], item?.["Url"]);
    if (question) result.push(question);
  }
  return result;
}

/** 个性化或主题推荐；Query 缺省时必须完全不带该参数。 */
export async function recommendQuestions(
  client: ZhihuClient,
  options: { query?: string; count: number },
): Promise<ZhihuQuestionItem[]> {
  const query: Record<string, string | number> = { Count: options.count };
  if (options.query !== undefined) query["Query"] = options.query;
  return questionItemsOf(
    await client.get("/user/question_recommendations", query),
  );
}

/** 拉取问题下已有回答的简短摘要。 */
export async function answerSummaries(
  client: ZhihuClient,
  questionUrl: string,
  limit: number,
): Promise<string[]> {
  const result: string[] = [];
  for (const value of itemsOf(
    await client.get("/content/question_answers", {
      QuestionUrl: questionUrl,
      Limit: limit,
    }),
  )) {
    const summary = record(value)?.["Summary"];
    if (typeof summary !== "string") continue;
    const compact = Array.from(summary.replace(/\s+/g, " ").trim())
      .slice(0, 200)
      .join("");
    if (compact) result.push(compact);
  }
  return result;
}

/** 热榜会混入别的内容类型，问题编号解析成功才保留。 */
export async function hotQuestions(
  client: ZhihuClient,
): Promise<ZhihuQuestionItem[]> {
  return questionItemsOf(await client.get("/content/hot_list", { Limit: 30 }));
}

function cleanSearchTitle(title: string): string {
  return title
    .replace(/<\/?em\b[^>]*>/gi, "")
    .replace(/\s+-\s*知乎\s*$/, "")
    .trim();
}

/** 搜索接口结果以文章居多，只保留关联到知乎问题的回答和问题。 */
export async function searchQuestions(
  client: ZhihuClient,
  query: string,
): Promise<ZhihuQuestionItem[]> {
  const result: ZhihuQuestionItem[] = [];
  for (const value of itemsOf(
    await client.get("/content/zhihu_search", { Query: query, Count: 10 }),
  )) {
    const item = record(value);
    const contentType = item?.["ContentType"];
    if (
      typeof contentType !== "string" ||
      !["answer", "question"].includes(contentType.toLowerCase())
    )
      continue;
    const question = normalizedQuestion(
      typeof item?.["Title"] === "string"
        ? cleanSearchTitle(item["Title"])
        : "",
      item?.["Url"],
    );
    if (question) result.push(question);
  }
  return result;
}
