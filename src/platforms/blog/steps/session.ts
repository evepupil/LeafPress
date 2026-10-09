/**
 * 一次使用博客检出目录的会话：拿博客仓库锁 → 把检出目录准备到线上最新的 main → 执行 → 释放锁。
 */
import type { CodeStepContext } from "../../types.js";
import { prepareCheckout } from "../checkout.js";
import { withBlogRepoLock } from "../lock.js";
import type { BlogStepConfig } from "./config.js";

export interface BlogCheckout {
  /** 检出目录（作者仓库的 worktree） */
  dir: string;
  /** 检出时线上 main 的提交号 */
  base: string;
}

/**
 * 锁被别的步骤占着时直接抛错（错误信息说清谁在用）；run 结束或抛错都会释放锁。
 * 检出目录不用还原，下次准备时会重置。
 */
export function withBlogCheckout<T>(
  ctx: CodeStepContext,
  config: BlogStepConfig,
  stepLabel: string,
  run: (checkout: BlogCheckout) => Promise<T>,
): Promise<T> {
  return withBlogRepoLock({
    home: config.home,
    accountId: ctx.account.id,
    workId: ctx.work.id,
    step: stepLabel,
    run: async () => {
      const { base } = await prepareCheckout({
        repo: config.repo,
        dir: config.checkoutDir,
        exec: ctx.exec,
        heartbeat: () => {
          ctx.heartbeat();
        },
      });
      return run({ dir: config.checkoutDir, base });
    },
  });
}
