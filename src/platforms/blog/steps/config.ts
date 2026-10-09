/**
 * 博客三个代码步骤共用的配置和失败写法。
 */
import { dirname, resolve } from "node:path";

import type { CodeOutcome } from "@leafpress/core";

import { redactSecrets } from "../../../config/redact.js";
import type { CodeStepContext } from "../../types.js";
import { blogCheckoutDir } from "../checkout.js";
import { redactUrlCredentials } from "../url-redact.js";

export interface BlogStepConfig {
  /** 作者的博客仓库：只对它做 fetch 和 worktree 操作，不碰它的工作区 */
  repo: string;
  /** 站点地址，已去掉末尾的 / */
  siteUrl: string;
  /** LeafPress 数据目录（放检出目录和仓库锁） */
  home: string;
  /** LeafPress 自己的博客检出目录 */
  checkoutDir: string;
}

export type BlogConfigResult =
  { ok: true; config: BlogStepConfig } | { ok: false; outcome: CodeOutcome };

/**
 * 数据目录。步骤上下文里没有单独给它，但任务文件夹固定在 <数据目录>/tasks/<作品编号>，
 * 往上两层就是数据目录。
 */
export function dataHome(ctx: Pick<CodeStepContext, "folder">): string {
  return dirname(dirname(resolve(ctx.folder)));
}

/** 站点地址是不是 http 或 https 开头的网址（协议后面紧跟主机名，整串不带空白） */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s/]\S*$/i.test(value) && URL.canParse(value);
}

/**
 * 读仓库位置和站点地址；缺哪个就直接失败，说清楚缺哪个。
 * 站点地址还要是 http(s) 开头的网址：写成 blog.chaosyn.com 这样没带协议的，
 * 推送会成功、文章也上线了，但归档那一步永远访问不到，作品结束不了。所以一开始就拦下。
 */
export function blogStepConfig(
  ctx: Pick<CodeStepContext, "setting" | "secret" | "folder"> & {
    account: Pick<CodeStepContext["account"], "id">;
  },
): BlogConfigResult {
  const repo = ctx.setting("repo-path")?.trim();
  if (!repo) {
    return {
      ok: false,
      outcome: { kind: "fail", error: "博客仓库位置还没配" },
    };
  }
  const site = ctx.setting("site-url")?.trim();
  if (!site) {
    return { ok: false, outcome: { kind: "fail", error: "站点地址还没配" } };
  }
  if (!isHttpUrl(site)) {
    return {
      ok: false,
      outcome: {
        kind: "fail",
        error: "站点地址的格式不对：要以 https:// 开头",
      },
    };
  }
  const home = dataHome(ctx);
  try {
    return {
      ok: true,
      config: {
        repo: resolve(repo),
        siteUrl: site.replace(/\/+$/, ""),
        home,
        checkoutDir: blogCheckoutDir(home, ctx.account.id),
      },
    };
  } catch (error) {
    // 账号编号不安全，拼不出检出目录
    return { ok: false, outcome: stepFailure(ctx, error) };
  }
}

/** 外部命令的输出、错误信息写进结果前先抹掉密钥和网址里的账号口令 */
export function redactBlogText(
  ctx: Pick<CodeStepContext, "secret">,
  text: string,
): string {
  return redactUrlCredentials(
    redactSecrets(text, [ctx.secret("umami-share") ?? ""]),
  );
}

/** 步骤失败的统一写法：抹掉密钥后只留错误信息 */
export function stepFailure(
  ctx: Pick<CodeStepContext, "secret">,
  error: unknown,
): CodeOutcome {
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "fail", error: redactBlogText(ctx, message) };
}
