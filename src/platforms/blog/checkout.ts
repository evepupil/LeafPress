/**
 * 博客检出目录：LeafPress 自己的一份博客工作区。
 *
 * 它是作者博客仓库的一个 git worktree（和作者仓库共用历史，但工作区、暂存区是独立的），
 * 位置 <数据目录>/blog-checkout/<账号编号>/。检查和推送都在这里做，作者自己的工作区从头到尾不动：
 * 对作者仓库只做 git fetch（只更新远程分支的记录）和 git worktree add / remove，
 * 不跑 git worktree prune（它会把作者其他工作树里「此刻路径不存在」的登记一起清掉，
 * 比如放在没插上的移动硬盘上的工作树）。
 * 每次使用前 prepareCheckout 把它重置到线上最新的 main，上次留下的垃圾、半截的提交都会被清掉，
 * 只保留 node_modules（装依赖很慢）。
 */
import { createHash } from "node:crypto";
import { readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertSafeId } from "../../files/ids.js";
import type { ExecFn } from "../../shared/exec.js";
import {
  commandFailed,
  outputTail,
  requireGit,
  runBlogGit,
} from "./blog-git.js";
import { runPnpm } from "./pnpm.js";

const FETCH_TIMEOUT_MS = 2 * 60_000;
/** 建、重置、清理检出目录：文件多时比一般 git 命令慢，给宽松些 */
const WORKTREE_TIMEOUT_MS = 3 * 60_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
/** 记着上次装依赖时 pnpm-lock.yaml 的哈希；放在检出目录里，清理时要留着 */
const LOCK_HASH_FILE = ".leafpress-lock-hash";

/** 检出目录的位置：<数据目录>/blog-checkout/<账号编号> */
export function blogCheckoutDir(home: string, accountId: string): string {
  assertSafeId(accountId);
  return join(home, "blog-checkout", accountId);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

/** 两个路径指向同一个目录（先还原成真实路径；Windows 上不分大小写） */
async function sameDirectory(left: string, right: string): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([realpath(left), realpath(right)]);
    return process.platform === "win32"
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
  } catch {
    return false;
  }
}

/** 这个目录是不是作者仓库登记在册的 worktree。重置前必须确认，免得在别的仓库里 clean 误删 */
async function isRegisteredWorktree(
  exec: ExecFn,
  repo: string,
  dir: string,
): Promise<boolean> {
  const listed = await runBlogGit(exec, repo, [
    "-C",
    repo,
    "worktree",
    "list",
    "--porcelain",
  ]);
  if (commandFailed(listed)) return false;
  for (const line of listed.stdout.split(/\r?\n/)) {
    if (!line.startsWith("worktree ")) continue;
    if (await sameDirectory(line.slice("worktree ".length), dir)) return true;
  }
  return false;
}

/**
 * 在 origin/main 上建检出目录。
 * --force：检出目录被删掉、但作者仓库里的登记还在时（「missing but already registered」），
 * git 会拒绝建，加了 --force 就直接复用这个路径，只清掉这一个路径的旧登记。
 * 不用 git worktree prune 去清：prune 会把作者其他工作树里路径此刻不存在的登记也一起清掉。
 */
async function addWorktree(
  exec: ExecFn,
  repo: string,
  dir: string,
): Promise<void> {
  await requireGit(
    exec,
    repo,
    ["-C", repo, "worktree", "add", "--force", "--detach", dir, "origin/main"],
    "无法创建博客检出目录",
    WORKTREE_TIMEOUT_MS,
  );
}

/** 把已有的检出目录重置到 origin/main，清掉未跟踪和被忽略的文件，只留 node_modules 和依赖标记 */
async function resetWorktree(exec: ExecFn, dir: string): Promise<void> {
  // 上次变基到一半被打断时留下的状态；没有变基在进行时这条会失败，不用管
  await runBlogGit(exec, dir, ["rebase", "--abort"]);
  await requireGit(
    exec,
    dir,
    ["checkout", "--detach", "--force", "origin/main"],
    "无法重置博客检出目录",
    WORKTREE_TIMEOUT_MS,
  );
  await requireGit(
    exec,
    dir,
    ["clean", "-fdx", "-e", "node_modules", "-e", LOCK_HASH_FILE],
    "无法清理博客检出目录",
    WORKTREE_TIMEOUT_MS,
  );
}

/** 推倒重建：先让 git 注销再删目录（目录不是登记在册的 worktree 时 git 会拒绝，直接删就是） */
async function rebuildWorktree(
  exec: ExecFn,
  repo: string,
  dir: string,
): Promise<void> {
  await runBlogGit(exec, repo, [
    "-C",
    repo,
    "worktree",
    "remove",
    "--force",
    dir,
  ]);
  // Windows 上文件偶尔被杀毒软件之类临时占着，删不掉时多试几次
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
  // 注销没成功、登记还留着也不要紧：addWorktree 带 --force，会直接复用这个路径
  await addWorktree(exec, repo, dir);
}

async function settleWorktree(
  exec: ExecFn,
  repo: string,
  dir: string,
): Promise<void> {
  try {
    if (!(await pathExists(dir))) {
      await addWorktree(exec, repo, dir);
    } else if (await isRegisteredWorktree(exec, repo, dir)) {
      await resetWorktree(exec, dir);
    } else {
      await rebuildWorktree(exec, repo, dir);
    }
  } catch {
    // 任何一步出错：推倒重建一次，再出错就如实报错
    await rebuildWorktree(exec, repo, dir);
  }
}

async function readLockHash(dir: string): Promise<string> {
  let contents: Buffer;
  try {
    contents = await readFile(join(dir, "pnpm-lock.yaml"));
  } catch {
    throw new Error("博客仓库缺少 pnpm-lock.yaml，无法安装依赖");
  }
  return createHash("sha256").update(contents).digest("hex");
}

/** pnpm-lock.yaml 变了或没有 node_modules 才重新装依赖；先离线装，不行再试优先离线 */
async function installDependencies(exec: ExecFn, dir: string): Promise<void> {
  const lockHash = await readLockHash(dir);
  const marker = join(dir, LOCK_HASH_FILE);
  let previousHash: string | undefined;
  try {
    previousHash = (await readFile(marker, "utf8")).trim();
  } catch {
    previousHash = undefined;
  }
  if (
    previousHash === lockHash &&
    (await pathExists(join(dir, "node_modules")))
  )
    return;

  const offline = await runPnpm(
    exec,
    dir,
    ["install", "--frozen-lockfile", "--offline"],
    INSTALL_TIMEOUT_MS,
  );
  if (commandFailed(offline)) {
    const preferred = await runPnpm(
      exec,
      dir,
      ["install", "--frozen-lockfile", "--prefer-offline"],
      INSTALL_TIMEOUT_MS,
    );
    if (commandFailed(preferred)) {
      const detail = outputTail(preferred);
      throw new Error(
        `博客的依赖装不上：先在博客仓库里运行 pnpm install${preferred.timedOut ? "（安装超时）" : ""}${detail ? `\n${detail}` : ""}`,
      );
    }
  }
  await writeFile(marker, `${lockHash}\n`, "utf8");
}

export interface PrepareCheckoutInput {
  /** 作者的博客仓库（只会对它 fetch 和 worktree add / remove） */
  repo: string;
  /** 检出目录，见 blogCheckoutDir */
  dir: string;
  exec: ExecFn;
  /** 每个耗时阶段开始前调一下，给租约续期 */
  heartbeat?: () => void;
  /** 要不要装依赖；缺省装。只读文章（导入）时传 false，省掉安装 */
  installDeps?: boolean;
}

/**
 * 把检出目录准备到线上最新的 main，返回它所在的提交号（origin/main）。
 * 步骤：fetch → 没有目录就 worktree add，有就重置并清理（出错推倒重建一次）→ 按需装依赖。
 */
export async function prepareCheckout(
  input: PrepareCheckoutInput,
): Promise<{ base: string }> {
  const { repo, dir, exec } = input;
  const beat = (): void => input.heartbeat?.();

  beat();
  await requireGit(
    exec,
    repo,
    ["-C", repo, "fetch", "origin"],
    "博客仓库 fetch 失败",
    FETCH_TIMEOUT_MS,
  );

  beat();
  await settleWorktree(exec, repo, dir);

  if (input.installDeps !== false) {
    beat();
    await installDependencies(exec, dir);
  }

  const head = await requireGit(
    exec,
    dir,
    ["rev-parse", "HEAD"],
    "无法读取博客检出目录的提交号",
  );
  const base = head.stdout.trim();
  if (!/^[0-9a-f]{40,64}$/i.test(base))
    throw new Error("博客检出目录返回的提交号格式不对");
  return { base };
}
