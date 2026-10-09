/**
 * 导入博客已有文章：把线上 main 上 content/posts/zh/ 里已发布的中文文章列出来，由用例建成已完成的作品。
 *
 * 先拿博客仓库锁、把 LeafPress 自己的检出目录准备到线上最新的 main（不装依赖，只读文章），
 * 这样线上由 Notion 同步进来、作者本地还没拉的文章也能导入；作者自己的工作区一点不碰。
 * 英文版不单独成作品；草稿跳过并计数；读不了的文章原样记进 issues。
 * 去重由用例按 sourceRef（再按链接）做，这里不管。
 */
import { join, relative, resolve, sep } from "node:path";

import { LeafPressError } from "../../shared/errors.js";
import type {
  ImportCandidate,
  ImportContext,
  ImportListing,
  ImportOutcome,
  PostImporter,
} from "../types.js";
import { blogCheckoutDir, prepareCheckout } from "./checkout.js";
import { withBlogRepoLock } from "./lock.js";
import { listBlogSources } from "./source-provider.js";
import { redactUrlCredentials } from "./url-redact.js";

const CONTENT_DIR = "content/posts";
const CHINESE_DIR = "zh";
const SETUP_HINT = "在账号详情 · 接入里填";

function notConfigured(reason: string): ImportOutcome {
  return { ok: false, reason, fixHint: SETUP_HINT };
}

function isInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent + sep);
}

/** 检出目录里的路径换成作者仓库里对应的路径：用户要找的是自己仓库里的文件 */
function authorPath(path: string, checkoutDir: string, repo: string): string {
  const resolved = resolve(path);
  return isInside(resolved, checkoutDir)
    ? join(repo, relative(checkoutDir, resolved))
    : path;
}

/** 在检出目录里读出中文文章 */
async function readChineseListing(input: {
  checkoutDir: string;
  repo: string;
  siteUrl: string;
}): Promise<ImportListing> {
  const { checkoutDir, repo, siteUrl } = input;
  let sources;
  try {
    sources = await listBlogSources({
      repoPath: checkoutDir,
      contentDir: CONTENT_DIR,
    });
  } catch (error) {
    if (error instanceof LeafPressError && error.code === "BLOG_REPO_INVALID")
      throw new LeafPressError(
        "BLOG_REPO_INVALID",
        `博客仓库的线上 main 里没有 ${CONTENT_DIR} 文件夹，确认博客仓库位置配对了`,
      );
    throw error;
  }

  const chineseRoot = resolve(checkoutDir, CONTENT_DIR, CHINESE_DIR);
  const issues = sources.issues
    .filter((issue) => isInside(resolve(issue.path), chineseRoot))
    .map((issue) => ({
      path: authorPath(issue.path, checkoutDir, repo),
      message: issue.message,
    }));
  const candidates: ImportCandidate[] = [];
  let drafts = 0;

  for (const source of sources.sources) {
    if (!source.ref.startsWith(`${CHINESE_DIR}/`)) continue;
    if (source.draft) {
      drafts += 1;
      continue;
    }
    const path = authorPath(source.path, checkoutDir, repo);
    if (source.publishedAt === undefined) {
      issues.push({ path, message: "缺少有效的发布日期" });
      continue;
    }
    const slug = source.ref.slice(CHINESE_DIR.length + 1);
    candidates.push({
      sourceRef: source.ref,
      title: source.title,
      url: `${siteUrl}/posts/${encodeURIComponent(slug)}/`,
      publishedAt: source.publishedAt,
      localPath: path,
      tags: [...source.tags],
    });
  }
  return { candidates, drafts, issues };
}

async function listBlogPosts(ctx: ImportContext): Promise<ImportOutcome> {
  const repoSetting = ctx.setting("repo-path")?.trim();
  if (!repoSetting) return notConfigured("博客仓库位置还没配");
  const siteSetting = ctx.setting("site-url")?.trim();
  if (!siteSetting) return notConfigured("站点地址还没配");

  const home = resolve(ctx.home);
  const repo = resolve(repoSetting);
  const siteUrl = siteSetting.replace(/\/+$/, "");
  try {
    const listing = await withBlogRepoLock({
      home,
      accountId: ctx.account.id,
      workId: "-",
      step: "导入文章",
      run: async () => {
        const checkoutDir = blogCheckoutDir(home, ctx.account.id);
        await prepareCheckout({
          repo,
          dir: checkoutDir,
          exec: ctx.exec,
          installDeps: false,
        });
        // 读文章也在锁里：出了锁，检出目录就可能被别的步骤重置
        return readChineseListing({
          checkoutDir: resolve(checkoutDir),
          repo,
          siteUrl,
        });
      },
    });
    return { ok: true, listing };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "读取博客文章失败";
    return {
      ok: false,
      reason: redactUrlCredentials(reason),
      ...(error instanceof LeafPressError && error.code === "STATE_CONFLICT"
        ? {}
        : { fixHint: "检查博客仓库位置是否是博客的 git 仓库，能不能联网" }),
    };
  }
}

export function createBlogImporter(): PostImporter {
  return { list: listBlogPosts };
}
