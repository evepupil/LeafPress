/**
 * 路径对作品：只认本站中文文章地址（<站点>/posts/<文章名>/）。
 * 作品这边是完整网址，Umami 那边是页面路径；比较前两边都先规范化：
 * 去掉 # 锚点和 ? 查询串、URL 解码、统一以 / 结尾。英文地址（/en/posts/…）和别的页面都对不上，不计。
 */
import type { Work } from "@leafpress/core";

import type { UmamiExpandedPath } from "./client.js";

/** 站点地址规则：主机名（不分大小写）和站点所在的路径前缀 */
export interface SiteRule {
  /** 配了站点地址才有：作品链接的主机名必须是它，不是本站的链接不计 */
  host?: string;
  /** 站点所在的路径，以 / 开头和结尾；站点在域名根上是 "/" */
  prefix: string;
}

export interface PathCount {
  pageviews: number;
  visitors: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 去掉锚点和查询串、URL 解码、统一以 / 结尾 */
export function normalizePath(raw: string): string {
  let path = raw.trim();
  const hash = path.indexOf("#");
  if (hash >= 0) path = path.slice(0, hash);
  const query = path.indexOf("?");
  if (query >= 0) path = path.slice(0, query);
  try {
    path = decodeURIComponent(path);
  } catch {
    // 解码不了（百分号后面不是十六进制）就按原样比
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return path.endsWith("/") ? path : `${path}/`;
}

/**
 * 读站点地址。没配返回「不限主机、站点在域名根上」；
 * 配了但不是网址返回 undefined。
 */
export function parseSiteRule(value: string | undefined): SiteRule | undefined {
  const text = value?.trim();
  if (!text) return { prefix: "/" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  return { host: url.host.toLowerCase(), prefix: normalizePath(url.pathname) };
}

/** 本站中文文章地址的路径形状：<前缀>posts/<一段文章名>/ */
function articlePattern(site: SiteRule): RegExp {
  return new RegExp(`^${escapeRegExp(site.prefix)}posts/[^/]+/$`);
}

/** 一条 Umami 页面路径是不是本站中文文章地址 */
export function isArticlePath(path: string, site: SiteRule): boolean {
  return articlePattern(site).test(path);
}

/** 作品链接对应的文章路径；不是本站中文文章地址返回 undefined */
export function articlePathOfUrl(
  url: string | undefined,
  site: SiteRule,
): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return undefined;
  if (site.host !== undefined && parsed.host.toLowerCase() !== site.host)
    return undefined;
  const path = normalizePath(parsed.pathname);
  return isArticlePath(path, site) ? path : undefined;
}

/**
 * 这个账号的作品按文章路径分组。同一个路径对着多个作品时（记录里有重复），它们各自拿到同样的数。
 */
export function worksByArticlePath(
  works: readonly Work[],
  accountId: string,
  site: SiteRule,
): Map<string, Work[]> {
  const groups = new Map<string, Work[]>();
  for (const work of works) {
    if (work.accountId !== accountId) continue;
    const path = articlePathOfUrl(work.url, site);
    if (path === undefined) continue;
    const group = groups.get(path);
    if (group) group.push(work);
    else groups.set(path, [work]);
  }
  return groups;
}

/**
 * Umami 返回的行按文章路径合并：原始行先按路径名去重（同一行出现两次只算一次），
 * 再按规范化后的路径合并求和。只留本站中文文章地址。
 */
export function countByArticlePath(
  rows: readonly UmamiExpandedPath[],
  site: SiteRule,
): Map<string, PathCount> {
  const counts = new Map<string, PathCount>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    const path = normalizePath(row.name);
    if (!isArticlePath(path, site)) continue;
    const previous = counts.get(path);
    counts.set(path, {
      pageviews: (previous?.pageviews ?? 0) + row.pageviews,
      visitors: (previous?.visitors ?? 0) + row.visitors,
    });
  }
  return counts;
}

/** 全站的访问合计（原始行按路径名去重后加起来），拿来和日序列的合计对账 */
export function siteTotalPageviews(rows: readonly UmamiExpandedPath[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const row of rows) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    total += row.pageviews;
  }
  return total;
}
