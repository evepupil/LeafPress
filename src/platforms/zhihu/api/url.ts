/**
 * 知乎链接的认法和规范化（模块设计 · 平台适配-知乎「归档链接」一节，与开放平台 ContentUrl 支持的写法一致）：
 * - 文章 `zhuanlan.zhihu.com/p/<数字>` → `https://zhuanlan.zhihu.com/p/<数字>`；
 * - 回答 `www.zhihu.com/question/<数字>/answer/<数字>` → 原样规范成完整链接；
 * - 回答短链 `www.zhihu.com/answer/<数字>` 也认，规范成完整链接；
 * - 其余（想法、视频、别的站、编号不是数字）返回 undefined。
 * 带不带 https、大小写主机名、末尾斜杠、查询串、锚点都不影响。
 */
import type { Work } from "@leafpress/core";

function digits(value: string | undefined): string | undefined {
  return value !== undefined && /^\d+$/.test(value) ? value : undefined;
}

/** 规范化知乎文章或回答链接；认不出返回 undefined */
export function normalizeZhihuUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const parts = url.pathname.split("/").filter((part) => part !== "");

  if (host === "zhuanlan.zhihu.com") {
    if (parts[0] !== "p") return undefined;
    const id = digits(parts[1]);
    return id === undefined ? undefined : `https://zhuanlan.zhihu.com/p/${id}`;
  }
  if (host === "www.zhihu.com" || host === "zhihu.com") {
    if (parts[0] === "answer") {
      const id = digits(parts[1]);
      return id === undefined
        ? undefined
        : `https://www.zhihu.com/answer/${id}`;
    }
    if (parts[0] === "question" && parts[2] === "answer") {
      const question = digits(parts[1]);
      const answer = digits(parts[3]);
      return question === undefined || answer === undefined
        ? undefined
        : `https://www.zhihu.com/question/${question}/answer/${answer}`;
    }
  }
  return undefined;
}

/** 链接的类别和编号，sourceRef 用 */
export interface ZhihuContentRef {
  kind: "article" | "answer";
  id: string;
  url: string;
}

/** 作品链接 → { kind, id, url }；认不出返回 undefined */
export function zhihuRefOf(
  raw: string | undefined,
): ZhihuContentRef | undefined {
  const url = raw === undefined ? undefined : normalizeZhihuUrl(raw);
  if (url === undefined) return undefined;
  const id = url.split("/").pop() ?? "";
  if (url.startsWith("https://zhuanlan.zhihu.com/p/"))
    return { kind: "article", id, url };
  return { kind: "answer", id, url };
}

/** 账号的作品里链接认得出来的（做快照的对象） */
export function zhihuWorks(works: readonly Work[]): Work[] {
  return works.filter((work) => zhihuRefOf(work.url) !== undefined);
}
