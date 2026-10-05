/**
 * 仓库状态读取（不联网）：给体检命令用。
 *
 * 原理：ahead/behind 按传入的 remote 和 branch 对应的远程跟踪分支
 * refs/remotes/<remote>/<branch>（全限定名）算，与 syncRepo 用同一个比较对象；
 * 该远程跟踪分支不存在时 hasUpstream 为 false、ahead/behind 为 0。
 * 不是 git 仓库（或路径不存在）时 isRepo: false、其余取默认值，不抛错。
 */
import { existsSync, statSync } from "node:fs";

import type { ExecFn } from "../../shared/exec.js";
import { runGit } from "./git-run.js";

/** git 状态（给体检命令用） */
export interface RepoStatus {
  /** 是不是一个 git 仓库（含 .git 目录存在） */
  isRepo: boolean;
  /** 当前分支名；不是仓库或取不到时为 undefined */
  branch?: string;
  /** 工作区有没有已跟踪文件的改动 */
  dirty: boolean;
  /** 有没有配置的远程跟踪分支 */
  hasUpstream: boolean;
  /** 本地比远程跟踪分支多几个提交 */
  ahead: number;
  /** 本地比远程跟踪分支少几个提交 */
  behind: number;
}

/** 读仓库当前分支名；失败返回 undefined */
export async function readCurrentBranch(
  exec: ExecFn,
  repoPath: string,
): Promise<string | undefined> {
  const result = await runGit(exec, repoPath, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (result.exitCode !== 0) return undefined;
  const branch = result.stdout.trim();
  // 空仓库或 HEAD 游离时可能拿到空串或 "HEAD"，都不算有效的分支名
  return branch === "" || branch === "HEAD" ? undefined : branch;
}

/** 工作区有没有已跟踪文件的改动（不含未跟踪文件）；syncRepo 也用 */
export async function isDirty(
  exec: ExecFn,
  repoPath: string,
): Promise<boolean> {
  const result = await runGit(exec, repoPath, [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  return result.exitCode === 0 && result.stdout.trim() !== "";
}

/**
 * 读仓库状态（不联网）。
 */
export async function readRepoStatus(
  exec: ExecFn,
  repoPath: string,
  remote: string,
  branch: string,
): Promise<RepoStatus> {
  const empty: RepoStatus = {
    isRepo: false,
    dirty: false,
    hasUpstream: false,
    ahead: 0,
    behind: 0,
  };
  // 仓库路径不存在、或存在但不是目录时不调 git（git 会报 ENOENT 被误当成别的问题），
  // 直接返回默认值
  if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) {
    return empty;
  }
  // 先确认是个 git 仓库
  const check = await runGit(exec, repoPath, [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  if (check.exitCode !== 0 || check.stdout.trim() !== "true") {
    return empty;
  }

  const currentBranch = await readCurrentBranch(exec, repoPath);
  const dirty = await isDirty(exec, repoPath);

  // 与 syncRepo 用同一个比较对象：远程跟踪分支的全限定名
  const count = await runGit(exec, repoPath, [
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...refs/remotes/${remote}/${branch}`,
  ]);
  if (count.exitCode !== 0) {
    // 远程跟踪分支不存在（没 fetch 过）：当没有上游，不抛错
    return {
      isRepo: true,
      branch: currentBranch,
      dirty,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
    };
  }
  const [aheadText, behindText] = count.stdout.trim().split(/\s+/);
  return {
    isRepo: true,
    branch: currentBranch,
    dirty,
    hasUpstream: true,
    ahead: Number.parseInt(aheadText ?? "0", 10) || 0,
    behind: Number.parseInt(behindText ?? "0", 10) || 0,
  };
}
