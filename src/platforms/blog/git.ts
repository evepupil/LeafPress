/**
 * 博客仓库的 git 快进拉取；仓库状态读取在 repo-status.ts（两者共用 runGit）。
 *
 * 原理：所有 git 调用都走注入的 ExecFn（生产环境是 execCommand），
 * 便于测试时替换成假实现；git 输出按 --porcelain / 固定格式解析，不依赖本地化设置。
 * 拉取只做快进（--ff-only）：有改动、有未推送提交、分叉一律不动仓库，只报告。
 * 网址里的账号口令必须先抹掉再进错误信息，避免泄漏。
 */
import type { ExecFn } from "../../shared/exec.js";
import { runGit } from "./git-run.js";
import { isDirty, readCurrentBranch } from "./repo-status.js";
import { redactUrlCredentials } from "./url-redact.js";

/** 同步结果（types.ts 的 SyncResult 加上中间信息） */
export interface SyncOutcome {
  action:
    | "fast-forwarded"
    | "up-to-date"
    | "skipped-dirty"
    | "skipped-ahead"
    | "skipped-diverged"
    | "failed";
  branch: string;
  behindBefore: number;
  aheadBefore: number;
  message: string;
}

/** 非错误的杂音行：bash 的 /tmp 警告之类，不配代表失败原因 */
const NOISE_LINE_RE = /^bash(\.exe)?:\s*warning:/i;

/**
 * 从 git 的错误输出里挑最能看到失败原因的一行。
 * 优先取第一条以 fatal: 或 error: 开头的行；没有的话取第一条非杂音的非空行
 * （本机 shell 会在前面打「bash.exe: warning: could not find /tmp…」之类的无关行）。
 * 网址里的账号口令先抹掉，保证错误信息里没有密钥。
 */
function gitErrorMessage(stderr: string, fallback: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const fatalOrError = lines.find((line) => /^(fatal|error):/i.test(line));
  const meaningful =
    fatalOrError ?? lines.find((line) => !NOISE_LINE_RE.test(line));
  return redactUrlCredentials(meaningful ?? fallback);
}

/** 默认拉取超时：60 秒 */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * 把博客仓库快进到远程最新。
 * 全程除最后的 merge --ff-only 外不改动仓库；任何失败都以 failed 报告，不抛错。
 */
export async function syncRepo(
  exec: ExecFn,
  repoPath: string,
  remote: string,
  branch: string,
): Promise<SyncOutcome> {
  /** 远程跟踪分支的全限定名：短名 origin/main 可能被本地同名分支抢走 */
  const remoteRef = `refs/remotes/${remote}/${branch}`;
  // 1. 当前分支必须是配置的分支，否则不动
  const currentBranch = await readCurrentBranch(exec, repoPath);
  if (currentBranch !== branch) {
    return {
      action: "failed",
      branch,
      behindBefore: 0,
      aheadBefore: 0,
      message: `当前在分支 ${currentBranch ?? "（未知）"}，配置的是 ${branch}，没有拉取`,
    };
  }

  // 2. fetch 指定的远程分支，并写明要更新哪个远程跟踪分支：
  //    +refs/heads/<branch>:refs/remotes/<remote>/<branch>，不依赖远程的 fetch 配置；
  //    失败或超时都按 failed 报告，附 stderr 第一行（先抹掉账号口令）
  const fetch = await runGit(
    exec,
    repoPath,
    ["fetch", remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`],
    FETCH_TIMEOUT_MS,
  );
  if (fetch.exitCode !== 0) {
    const detail = gitErrorMessage(fetch.stderr, "git fetch 没有输出错误信息");
    return {
      action: "failed",
      branch,
      behindBefore: 0,
      aheadBefore: 0,
      message: fetch.timedOut
        ? `拉取超时（${FETCH_TIMEOUT_MS / 1000} 秒）${detail === "git fetch 没有输出错误信息" ? "" : `：${detail}`}`
        : `拉取失败：${detail}`,
    };
  }

  // 3. 算本地领先/落后几个提交。用全限定 ref，防止仓库里碰巧有
  //    叫 origin/main 的本地分支时，短名被解析到 refs/heads/origin/main
  const count = await runGit(exec, repoPath, [
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...${remoteRef}`,
  ]);
  if (count.exitCode !== 0) {
    return {
      action: "failed",
      branch,
      behindBefore: 0,
      aheadBefore: 0,
      message: `无法比较本地与远程：${gitErrorMessage(count.stderr, "git rev-list 没有输出错误信息")}`,
    };
  }
  const [aheadText, behindText] = count.stdout.trim().split(/\s+/);
  const aheadBefore = Number.parseInt(aheadText ?? "0", 10) || 0;
  const behindBefore = Number.parseInt(behindText ?? "0", 10) || 0;

  // 4. 判定：都为 0 最新；双方都大于 0 分叉；只有 ahead 大于 0 有未推送提交
  if (aheadBefore === 0 && behindBefore === 0) {
    return {
      action: "up-to-date",
      branch,
      behindBefore,
      aheadBefore,
      message: "已经是最新",
    };
  }
  if (aheadBefore > 0 && behindBefore > 0) {
    return {
      action: "skipped-diverged",
      branch,
      behindBefore,
      aheadBefore,
      message: `本地与远程分叉（本地多 ${aheadBefore} 个提交、少 ${behindBefore} 个），没有动仓库`,
    };
  }
  if (aheadBefore > 0) {
    return {
      action: "skipped-ahead",
      branch,
      behindBefore,
      aheadBefore,
      message: `本地有 ${aheadBefore} 个未推送提交，没有动仓库`,
    };
  }

  // 只有 behind 大于 0：工作区有已跟踪文件的改动就不动
  if (await isDirty(exec, repoPath)) {
    return {
      action: "skipped-dirty",
      branch,
      behindBefore,
      aheadBefore,
      message: "工作区有未提交改动，没有动仓库",
    };
  }

  // 5. 快进合并：同样用全限定 ref
  const merge = await runGit(exec, repoPath, ["merge", "--ff-only", remoteRef]);
  if (merge.exitCode !== 0) {
    return {
      action: "failed",
      branch,
      behindBefore,
      aheadBefore,
      message: `快进失败：${gitErrorMessage(merge.stderr, "git merge 没有输出错误信息")}`,
    };
  }
  return {
    action: "fast-forwarded",
    branch,
    behindBefore,
    aheadBefore,
    message: `快进到远程最新（补上 ${behindBefore} 个提交）`,
  };
}
