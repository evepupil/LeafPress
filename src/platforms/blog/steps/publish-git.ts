/**
 * 提交并推送的 git 部分：只提交目标路径、推到线上 main，推送被拒就变基重推，
 * 超时或结果不明就到线上核对，不会推两次，也不会把已经推成功的当成失败。
 *
 * 全部在博客检出目录里做。出错只抛 Error，信息是写给人看的最终文字。
 */
import type { ExecResult } from "../../../shared/exec.js";
import type { CodeStepContext } from "../../types.js";
import { commandFailed, outputTail, runBlogGit } from "../blog-git.js";

const PUSH_TIMEOUT_MS = 2 * 60_000;
const FETCH_TIMEOUT_MS = 2 * 60_000;
/** 推送被拒后，最多变基重推几次 */
const MAX_REBASE_RETRIES = 2;

const SHA_PATTERN = /^[0-9a-f]{40,64}$/i;

async function requireOk(
  ctx: CodeStepContext,
  dir: string,
  args: readonly string[],
  description: string,
  timeoutMs?: number,
): Promise<ExecResult> {
  const result = await runBlogGit(ctx.exec, dir, args, timeoutMs);
  if (commandFailed(result)) {
    const detail = result.timedOut ? "超时" : outputTail(result, 10);
    throw new Error(`${description}：${detail}`);
  }
  return result;
}

/** 检出目录当前所在的提交号 */
async function currentCommit(
  ctx: CodeStepContext,
  dir: string,
): Promise<string> {
  const result = await requireOk(
    ctx,
    dir,
    ["rev-parse", "HEAD"],
    "无法读取提交号",
  );
  const commit = result.stdout.trim();
  if (!SHA_PATTERN.test(commit)) throw new Error("git 返回的提交号格式不对");
  return commit;
}

/** 最近一次动过这个路径的提交号（线上已有这篇时用来补推送凭据） */
export async function lastCommitTouching(
  ctx: CodeStepContext,
  dir: string,
  path: string,
): Promise<string> {
  const result = await requireOk(
    ctx,
    dir,
    ["log", "-1", "--format=%H", "--", path],
    "无法读取这篇文章的提交号",
  );
  const commit = result.stdout.trim();
  if (!SHA_PATTERN.test(commit)) throw new Error("线上这篇文章没有提交记录");
  return commit;
}

/**
 * 提交：git add 再 git commit -m "post: <标题>" -- <路径>，只提交这几个路径。
 * 用户名、邮箱用作者仓库的 git 配置；没配、钩子拦住等提交失败都写明原因。
 * 返回新提交的提交号。
 */
export async function commitPost(
  ctx: CodeStepContext,
  dir: string,
  title: string,
  paths: readonly string[],
): Promise<string> {
  await requireOk(ctx, dir, ["add", "--", ...paths], "提交失败（git add）");
  const subject = `post: ${title.replace(/\s+/g, " ").trim()}`;
  await requireOk(
    ctx,
    dir,
    ["commit", "-m", subject, "--", ...paths],
    "提交失败",
  );
  return currentCommit(ctx, dir);
}

/** 推送被拒（线上 main 比本地新）；别的失败原因（没权限、钩子拒绝）不算 */
function wasRejected(push: ExecResult): boolean {
  return /\[rejected\]/.test(`${push.stderr}\n${push.stdout}`);
}

/** 线上前进了：同步线上、把本次提交变基上去；变基不了就撤回变基并报错 */
async function rebaseOntoOnline(
  ctx: CodeStepContext,
  dir: string,
): Promise<void> {
  await requireOk(
    ctx,
    dir,
    ["fetch", "origin"],
    "推送被拒后同步线上失败",
    FETCH_TIMEOUT_MS,
  );
  const rebase = await runBlogGit(ctx.exec, dir, ["rebase", "origin/main"]);
  if (commandFailed(rebase)) {
    await runBlogGit(ctx.exec, dir, ["rebase", "--abort"]);
    throw new Error(
      `线上有新提交，把这篇文章接到最新的 main 上失败（可能线上同时出现了同名文章）：${outputTail(rebase, 10)}；可以重新运行 work run`,
    );
  }
}

/** 推送超时或结果不明：到线上核对这次提交在不在 */
async function confirmOnline(
  ctx: CodeStepContext,
  dir: string,
  commit: string,
  push: ExecResult,
): Promise<string> {
  const reason = push.timedOut ? "推送超时" : outputTail(push, 10);
  const fetched = await runBlogGit(
    ctx.exec,
    dir,
    ["fetch", "origin"],
    FETCH_TIMEOUT_MS,
  );
  if (commandFailed(fetched)) {
    throw new Error(
      `推送结果不明，也没能连上线上核对（${reason}）；可以重新运行 work run，重跑时会先看线上有没有这篇`,
    );
  }
  const ancestor = await runBlogGit(ctx.exec, dir, [
    "merge-base",
    "--is-ancestor",
    commit,
    "origin/main",
  ]);
  if (ancestor.exitCode === 0 && !ancestor.timedOut) return commit;
  // merge-base 退出码 1 才是「确实不在线上」；别的失败说明核对本身没做成
  if (ancestor.exitCode !== 1 || ancestor.timedOut) {
    throw new Error(
      `推送结果不明，也没能核对线上有没有这次提交（${reason}）；可以重新运行 work run，重跑时会先看线上有没有这篇`,
    );
  }
  throw new Error(
    `推送没成功，线上没有这次提交，可以重新运行 work run：${reason}`,
  );
}

/**
 * 推到线上 main，返回线上有的那次提交号。
 * afterRebase：变基之后、再推之前调用，用来重新跑一次内容检查，不过就抛错。
 */
export async function pushToMain(
  ctx: CodeStepContext,
  dir: string,
  afterRebase: () => Promise<void>,
): Promise<string> {
  for (let rebases = 0; ;) {
    const commit = await currentCommit(ctx, dir);
    const push = await runBlogGit(
      ctx.exec,
      dir,
      ["push", "origin", "HEAD:main"],
      PUSH_TIMEOUT_MS,
    );
    if (!commandFailed(push)) return commit;

    if (!push.timedOut && wasRejected(push)) {
      if (rebases >= MAX_REBASE_RETRIES) {
        throw new Error(
          `推送被拒了 ${rebases + 1} 次（线上一直有新提交），可以重新运行 work run`,
        );
      }
      await rebaseOntoOnline(ctx, dir);
      await afterRebase();
      rebases += 1;
      continue;
    }
    return confirmOnline(ctx, dir, commit, push);
  }
}
