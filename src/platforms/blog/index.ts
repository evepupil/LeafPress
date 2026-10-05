/**
 * 博客平台接入。
 *
 * 编号 blog，名字「博客」；能力只有长文；带原稿来源（列、读、拉到最新）。
 * 拉到最新复用 git.ts 的 syncRepo，把结果换成 types.ts 的 SyncResult。
 */
import type {
  PlatformAdapter,
  PlatformCapability,
  SourceListing,
  SourceProvider,
  SyncResult,
} from "../types.js";
import type { FormatConstraints } from "../../core/formats.js";
import type { PlatformId } from "../../core/content.js";
import type { ExecFn } from "../../shared/exec.js";
import { execCommand } from "../../shared/exec.js";
import { LeafPressError } from "../../shared/errors.js";
import { syncRepo } from "./git.js";
import type { BlogSourceProviderOptions } from "./source-provider.js";
import { listBlogSources, readBlogSource } from "./source-provider.js";

/** 平台编号 */
export const BLOG_PLATFORM_ID: PlatformId = "blog";

/** 长文能力：博客是原稿，全部支持 */
const BLOG_ARTICLE_CONSTRAINTS: FormatConstraints = {
  titleRequired: true,
  supportsCodeBlocks: true,
  supportsMath: true,
  supportsMermaid: true,
  supportsExternalLinks: true,
};

const BLOG_CAPABILITIES: readonly PlatformCapability[] = [
  {
    format: "article",
    constraints: BLOG_ARTICLE_CONSTRAINTS,
    publishModes: ["git"],
  },
];

export interface CreateBlogAdapterOptions extends BlogSourceProviderOptions {
  /** git 远程名，比如 origin（不能填网址） */
  remote: string;
  /** 要拉取的分支 */
  branch: string;
  /** 执行外部命令的函数；测试可换成假实现 */
  exec?: ExecFn;
}

/** 含 "://" 算网址；git@host:path 形式也算网址 */
function looksLikeUrl(remote: string): boolean {
  return remote.includes("://") || /^[^@\s]+@[^@\s:]+:/.test(remote);
}

/**
 * 创建博客平台接入。
 * 原稿目录 = <repoPath>/<contentDir>，下面每个子目录是一个语言目录。
 */
export function createBlogAdapter(
  options: CreateBlogAdapterOptions,
): PlatformAdapter {
  // blog.remote 只能是远程名（比如 origin），网址在这里就拒绝，不要等到 git 命令才报错。
  // 错误信息不回显 remote 的值：它可能带账号口令，会进终端和日志
  if (looksLikeUrl(options.remote)) {
    throw new LeafPressError(
      "CONFIG_INVALID",
      "blog.remote 要填远程名（比如 origin），不是网址",
      { hint: "请把它改成 git remote add 时的远程名。" },
    );
  }
  const exec: ExecFn = options.exec ?? execCommand;

  const sources: SourceProvider = {
    async sync(): Promise<SyncResult> {
      const outcome = await syncRepo(
        exec,
        options.repoPath,
        options.remote,
        options.branch,
      );
      return {
        action: outcome.action,
        branch: outcome.branch,
        behindBefore: outcome.behindBefore,
        aheadBefore: outcome.aheadBefore,
        message: outcome.message,
      };
    },
    list(): Promise<SourceListing> {
      return listBlogSources(options);
    },
    read(ref: string) {
      return readBlogSource(options, ref);
    },
  };

  return {
    id: BLOG_PLATFORM_ID,
    name: "博客",
    capabilities: BLOG_CAPABILITIES,
    sources,
  };
}
