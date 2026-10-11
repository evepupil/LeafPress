/**
 * 导入知乎已发内容：翻完本人内容列表（user/contents，ContentType=all，Offset 分页），
 * 只留文章和回答，交由用例建成已完成的作品。
 *
 * 每条：sourceRef 同归档的写法（zhihu/article/<编号>、zhihu/answer/<编号>，编号从链接里解析）、
 * url 规范化、标题（列表自带的 Title）、CreatedAt 是秒级时间戳，换成本地日期当发布日期。
 * 链接解析不了的条目记进 issues，不去重（用例按 sourceRef、链接做）。
 *
 * 密钥、fetch 和等待都在 ctx 里（ImportContext.secret / ImportContext.fetch / ImportContext.sleep）；
 * 密钥只进请求头，不进返回值，用例在写库和返回前还会再抹一遍。
 */
import { dayOfDate } from "@leafpress/core";

import { createZhihuClient } from "./api/client.js";
import { ZhihuApiError, ZhihuAuthenticationError } from "./api/errors.js";
import { normalizeZhihuUrl } from "./api/url.js";
import type {
  ImportCandidate,
  ImportContext,
  ImportListing,
  ImportOutcome,
  PostImporter,
} from "../types.js";

/** 一页最多取 50（调研文档 3.3 节：Limit 最大 50） */
const PAGE_LIMIT = 50;
/** 翻页的保护上限：账号内容再多也不许无限翻下去 */
const MAX_PAGES = 400;

const SETUP_HINT = "在账号详情 · 接入里填";

interface ContentEntry {
  contentType: string;
  url: string;
  createdAt: number;
  title: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function contentEntry(item: unknown): ContentEntry | undefined {
  const entry = record(item);
  const contentType = entry?.["ContentType"];
  const url = entry?.["Url"];
  const createdAt = entry?.["CreatedAt"];
  const title = entry?.["Title"];
  if (
    typeof contentType !== "string" ||
    typeof url !== "string" ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt)
  )
    return undefined;
  return {
    contentType,
    url,
    createdAt,
    title: typeof title === "string" ? title : "",
  };
}

/** 只导文章和回答；想法、视频、问题等别的类型跳过 */
function isWanted(contentType: string): boolean {
  return contentType === "article" || contentType === "answer";
}

/** 一条内容变成候选项；链接解析不了返回给用例看的 issue */
function candidateOf(
  entry: ContentEntry,
):
  | { candidate: ImportCandidate }
  | { issue: { path: string; message: string } } {
  const url = normalizeZhihuUrl(entry.url);
  if (!url)
    return {
      issue: { path: entry.url, message: "不是能认的知乎文章或回答链接" },
    };
  const id = url.split("/").at(-1) ?? "";
  const kind = entry.contentType === "article" ? "article" : "answer";
  return {
    candidate: {
      sourceRef: `zhihu/${kind}/${id}`,
      title: entry.title,
      url,
      // 秒级时间戳 → 本地日期
      publishedAt: dayOfDate(new Date(entry.createdAt * 1000)),
      tags: [],
    },
  };
}

/** 翻页出错（IsEnd=false 但 NextOffset 缺失/不是数字/不前进/超过上限）：不能悄悄只导一半 */
export class ZhihuPagingError extends Error {
  constructor() {
    super("知乎内容列表翻页出错，这次没导入");
    this.name = "ZhihuPagingError";
  }
}

/** 翻完 user/contents 的每一页；有一条读不了记 issue 继续，翻页出错整次失败 */
async function listContents(
  ctx: ImportContext,
  secret: string,
): Promise<ImportListing> {
  const client = createZhihuClient({
    secret,
    fetch: ctx.fetch,
    // 接口限流要留间隔；没给（比如旧调用方）时客户端用自己的等待
    sleep: async (ms) => {
      await ctx.sleep?.(ms);
    },
  });
  const issues: { path: string; message: string }[] = [];
  const candidates: ImportCandidate[] = [];
  let offset = 0;
  let finished = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await client.get("/user/contents", {
      Offset: offset,
      Limit: PAGE_LIMIT,
      ContentType: "all",
    });
    const data = record(payload);
    if (!Array.isArray(data?.["Items"])) throw new ZhihuPagingError();
    const items = data["Items"];
    const paging = record(data?.["Paging"]);
    const isEnd = paging?.["IsEnd"] === true;
    const nextOffset = paging?.["NextOffset"];

    for (const item of items) {
      const entry = contentEntry(item);
      if (!entry) {
        issues.push({ path: "user/contents", message: "有一条内容读不了" });
        continue;
      }
      if (!isWanted(entry.contentType)) continue;
      const result = candidateOf(entry);
      if ("candidate" in result) candidates.push(result.candidate);
      else issues.push(result.issue);
    }

    if (isEnd) {
      finished = true;
      break;
    }
    const next =
      typeof nextOffset === "string" || typeof nextOffset === "number"
        ? Number(nextOffset)
        : NaN;
    if (!Number.isInteger(next) || next <= offset) throw new ZhihuPagingError();
    offset = next;
  }
  // 循环跑满 MAX_PAGES 还没等到 IsEnd：不肯盲拉，整次失败
  if (!finished) throw new ZhihuPagingError();
  return { candidates, drafts: 0, issues };
}

export function createZhihuImporter(): PostImporter {
  return {
    async list(ctx): Promise<ImportOutcome> {
      const secret = ctx.secret("access-secret")?.trim();
      if (!secret)
        return {
          ok: false,
          reason: "开放平台密钥还没配",
          fixHint: SETUP_HINT,
        };
      try {
        return {
          ok: true,
          listing: await listContents(ctx, secret),
        };
      } catch (error) {
        if (error instanceof ZhihuAuthenticationError)
          return {
            ok: false,
            reason: error.message,
            fixHint: "在知乎开放平台个人中心重新生成，填到接入里",
          };
        const reason =
          error instanceof ZhihuPagingError
            ? error.message
            : error instanceof ZhihuApiError
              ? error.message
              : "知乎内容列表读取失败";
        return {
          ok: false,
          reason,
          fixHint: "检查网络后重试；密钥在接入里重新生成",
        };
      }
    },
  };
}
