/**
 * 提交并推送（publish）：把检查过的稿子提交到博客检出目录，推到线上 main。
 *
 * 可以安全地重复执行：先看线上有没有这篇（有同内容就当作已推送），推送超时就到线上核对。
 * 全部在 LeafPress 自己的检出目录里做，作者的博客工作区不动；
 * 推送后作者本地的 main 会落后一个提交，照常 git pull 就行。
 */
import type { CodeOutcome } from "@leafpress/core";

import type { CodeStepContext } from "../../types.js";
import { runCheck } from "./checks.js";
import { lastLines } from "./checks.js";
import { blogStepConfig, stepFailure } from "./config.js";
import { hashDraft, loadDraft, type Draft } from "./draft.js";
import {
  CollisionError,
  DraftChangedError,
  commitPaths,
  compareOnlinePost,
  copyDraftIn,
  hashCopiedDraft,
  postTargets,
} from "./post-files.js";
import { commitPost, lastCommitTouching, pushToMain } from "./publish-git.js";
import {
  type GateRecord,
  clearPublishRecord,
  readGateRecord,
  writePublishRecord,
} from "./records.js";
import { withBlogCheckout } from "./session.js";

const STEP_LABEL = "提交并推送";
const CONTENT_CHECK = {
  name: "content:check",
  args: ["content:check"],
  timeoutMs: 2 * 60_000,
} as const;

/** 稿子和检查时的不一样了：要退回去重新检查 */
function staleGateFailure(ctx: CodeStepContext): CodeOutcome {
  return {
    kind: "fail",
    error: `稿子在检查之后改过：先运行 leafpress work back ${ctx.work.id} 4 重新跑检查`,
  };
}

function collisionFailure(ctx: CodeStepContext, path: string): CodeOutcome {
  return {
    kind: "fail",
    error: `slug 撞了已有文章：${path}；改 slug.txt 里的 slug，再运行 leafpress work back ${ctx.work.id} 4 重新跑检查`,
  };
}

/** 复制进检出目录后再确认一次内容检查；不过就抛错（检出目录下次会重置，不用收拾） */
async function requireContentCheck(
  ctx: CodeStepContext,
  dir: string,
): Promise<void> {
  const result = await runCheck(ctx, dir, CONTENT_CHECK);
  if (!result.passed) {
    throw new Error(
      `博客 content:check 没过：${lastLines(result.tail ?? "", 15)}`,
    );
  }
}

async function publishFromCheckout(
  ctx: CodeStepContext,
  draft: Draft,
  gate: GateRecord,
  dir: string,
): Promise<CodeOutcome> {
  const targets = postTargets(draft.slug);

  // 线上已经有这篇：内容相同就是上次推成功了只是没记下来，不同就是 slug 撞了别的文章
  const online = await compareOnlinePost(dir, draft);
  if (online === "different") return collisionFailure(ctx, targets.chinese);
  if (online === "same") {
    writePublishRecord(ctx.folder, {
      slug: draft.slug,
      commit: await lastCommitTouching(ctx, dir, targets.chinese),
      pushedAt: ctx.now.toISOString(),
    });
    return { kind: "done", note: "线上已经有这篇了，按已推送处理" };
  }

  try {
    await copyDraftIn(dir, draft);
  } catch (error) {
    if (error instanceof CollisionError)
      return collisionFailure(ctx, error.path);
    // 复制时稿子里的文件已经没了：和核对对不上一样，稿子在检查之后被动过
    if (error instanceof DraftChangedError) return staleGateFailure(ctx);
    throw error;
  }
  // 前面核对过一次凭据，但从那以后拿锁、同步线上、装依赖可能过了好几分钟，稿子随时可能被改。
  // 所以复制进来之后再核对一次：提交的必须就是检查过的那一版，不然格式和构建从没见过它
  if ((await hashCopiedDraft(dir, draft)) !== gate.hash)
    return staleGateFailure(ctx);
  await requireContentCheck(ctx, dir);

  await commitPost(ctx, dir, draft.chinese.title, commitPaths(draft));
  const commit = await pushToMain(ctx, dir, () =>
    requireContentCheck(ctx, dir),
  );

  writePublishRecord(ctx.folder, {
    slug: draft.slug,
    commit,
    pushedAt: ctx.now.toISOString(),
  });
  return { kind: "done", note: `已推送（提交 ${commit.slice(0, 7)}）` };
}

export async function publishBlogDraft(
  ctx: CodeStepContext,
): Promise<CodeOutcome> {
  const configured = blogStepConfig(ctx);
  if (!configured.ok) return configured.outcome;
  try {
    await clearPublishRecord(ctx.folder);
    const draft = await loadDraft(ctx.folder);
    const gate = await readGateRecord(ctx.folder);
    if (
      gate === undefined ||
      gate.slug !== draft.slug ||
      gate.hash !== (await hashDraft(draft))
    ) {
      return staleGateFailure(ctx);
    }
    return await withBlogCheckout(
      ctx,
      configured.config,
      STEP_LABEL,
      (checkout) => publishFromCheckout(ctx, draft, gate, checkout.dir),
    );
  } catch (error) {
    return stepFailure(ctx, error);
  }
}
