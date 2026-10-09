/**
 * 跑博客检查（gate）：稿子放进博客检出目录，排版后依次跑内容、格式、构建三项检查。
 *
 * 全部在 LeafPress 自己的检出目录里做，作者的博客工作区一个字节都不动。
 * 只有三项全过才写 .gate.json，publish 靠它确认推出去的就是检查过的稿子。
 * 作者的写博客 skill 还会跑 lint、typecheck、test：这几项只查代码，推送后博客的 CI 会跑，
 * 这里不跑，把整个检查控制在 10 分钟内。
 *
 * 检查要跑好几分钟（构建实测 241 秒），这期间任务文件夹里的稿子可能被人改了。
 * 所以稿子复制进检出目录的那一刻就算出指纹，检查跑完再算一次任务文件夹里的：
 * 对不上就判这次检查失败，不写 .gate.json，也不把排好版的稿子拷回去（那会吃掉期间的修改）。
 */
import type { CodeOutcome } from "@leafpress/core";

import type { CodeStepContext } from "../../types.js";
import { type CheckResult, formatReport, runCheck } from "./checks.js";
import { blogStepConfig, stepFailure } from "./config.js";
import { currentDraftHash, hashDraft, loadDraft, type Draft } from "./draft.js";
import {
  type Collision,
  CollisionError,
  DraftChangedError,
  copyDraftIn,
  copyFormattedBack,
  findCollision,
  hashCopiedDraft,
  postTargets,
} from "./post-files.js";
import {
  clearGateOutputs,
  writeCheckReport,
  writeGateRecord,
} from "./records.js";
import { type BlogCheckout, withBlogCheckout } from "./session.js";

const STEP_LABEL = "跑博客检查";

const FORMAT_TIMEOUT_MS = 2 * 60_000;
/** 依次跑的三项检查；前一项没过就不跑后面的 */
const CHECKS = [
  { name: "content:check", args: ["content:check"], timeoutMs: 2 * 60_000 },
  { name: "format:check", args: ["format:check"], timeoutMs: 3 * 60_000 },
  { name: "build", args: ["build"], timeoutMs: 8 * 60_000 },
] as const;

/** 检查期间稿子被改过时的失败原因 */
export const CHANGED_DURING_CHECK = "稿子在检查期间改过，重新跑检查";

/** 撞车时给作者的提示。配对键撞车要单独说：配对键写在两篇稿子里，只改 slug.txt 没用 */
export function collisionMessage(collision: Collision): string {
  if (collision.kind === "translationKey") {
    return `译文配对键 ${collision.key} 和已有文章 ${collision.path} 撞了：换一个 slug 写进 slug.txt，同时把中英两篇稿子 frontmatter 里的 translationKey 改成新的 slug，再跑`;
  }
  return `slug 撞了已有文章：${collision.path}，改 slug.txt 里的 slug 再跑`;
}

/** 排版，再依次跑三项检查；排版没过或某一项没过就停 */
async function runAllChecks(
  ctx: CodeStepContext,
  dir: string,
  draft: Draft,
): Promise<CheckResult[]> {
  const targets = postTargets(draft.slug);
  const results: CheckResult[] = [];
  const formatted = await runCheck(ctx, dir, {
    name: "prettier 排版",
    args: ["exec", "prettier", "--write", targets.chinese, targets.english],
    timeoutMs: FORMAT_TIMEOUT_MS,
  });
  results.push(formatted);
  if (!formatted.passed) return results;
  for (const check of CHECKS) {
    const result = await runCheck(ctx, dir, check);
    results.push(result);
    if (!result.passed) break;
  }
  return results;
}

async function checkInCheckout(
  ctx: CodeStepContext,
  draft: Draft,
  checkout: BlogCheckout,
): Promise<CodeOutcome> {
  const collision = await findCollision(checkout.dir, draft);
  if (collision !== undefined)
    return { kind: "fail", error: collisionMessage(collision) };
  try {
    await copyDraftIn(checkout.dir, draft);
  } catch (error) {
    if (error instanceof CollisionError)
      return {
        kind: "fail",
        error: collisionMessage({ kind: "path", path: error.path }),
      };
    // 读出稿子之后、复制之前，稿子里的文件被删了
    if (error instanceof DraftChangedError)
      return { kind: "fail", error: CHANGED_DURING_CHECK };
    throw error;
  }
  // 稿子进检出目录的这一刻定下指纹：下面三项检查跑的就是这一版
  const checkedHash = await hashCopiedDraft(checkout.dir, draft);

  const results = await runAllChecks(ctx, checkout.dir, draft);

  // 检查期间任务文件夹里的稿子改过：这次的检查结果说的是旧版本，一概作废
  if ((await currentDraftHash(ctx.folder)) !== checkedHash)
    return { kind: "fail", error: CHANGED_DURING_CHECK };

  // 排版成功才有排好版的稿子；放回任务文件夹，agent 后面改稿就改这份
  if (results[0]?.passed) await copyFormattedBack(checkout.dir, draft);

  writeCheckReport(ctx.folder, formatReport(results));
  const failed = results.find((result) => !result.passed);
  if (failed) {
    return {
      kind: "fail",
      error: `博客检查没过：${failed.name}（详情在 检查结果.txt）`,
    };
  }

  writeGateRecord(ctx.folder, {
    passed: true,
    slug: draft.slug,
    // 排好版之后（也就是放回任务文件夹的这份）的指纹，publish 拿它核对
    hash: await hashDraft(draft),
    base: checkout.base,
    checkedAt: ctx.now.toISOString(),
  });
  return { kind: "done", note: "博客检查全过" };
}

export async function gateBlogDraft(
  ctx: CodeStepContext,
): Promise<CodeOutcome> {
  const configured = blogStepConfig(ctx);
  if (!configured.ok) return configured.outcome;
  try {
    // 上一轮的检查凭据和报告先作废，免得这轮没跑成时被当成「检查过了」
    await clearGateOutputs(ctx.folder);
    const draft = await loadDraft(ctx.folder);
    return await withBlogCheckout(
      ctx,
      configured.config,
      STEP_LABEL,
      (checkout) => checkInCheckout(ctx, draft, checkout),
    );
  } catch (error) {
    return stepFailure(ctx, error);
  }
}
