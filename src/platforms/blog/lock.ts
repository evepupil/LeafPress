/**
 * 博客仓库锁：同一个博客账号的检出目录一次只许一个步骤（或导入）使用。
 *
 * 锁是数据目录里的一个文件夹 <数据目录>/locks/blog-<账号编号>/，里面的 owner.json 记着
 * { pid, instance, startedAt, step, workId }。建文件夹是原子的，建成功的人拿到锁。
 * 拿不到时看持有者：进程还活着且开始不到 60 分钟，就立即失败并告诉用户谁在用；
 * 否则当作上次异常退出留下的，先拿「.reaper」短锁，复查还是过期，再把锁文件夹改名成
 * 墓碑后删掉（改名是原子的，不会误删别人刚建好的新锁），然后自己再来拿。
 * 释放时同样走「.reaper」，并确认锁还是自己的才删，避免超过 60 分钟被别人接管后误删。
 *
 * 本进程正持有的锁另有一张进程内的表（heldLocks）。常驻的本机服务进程里，释放可能失败
 * （Windows 上别的进程正在读 owner.json 时，文件夹改名会被拒），锁文件夹就留在了还活着的
 * 本进程名下；只看「持有者进程活着、开始不到 60 分钟」的话，本进程认不回自己的锁，
 * 之后一小时内这个账号的检查、推送、导入全被拒。有了这张表：锁里写着本进程、
 * 表里却没有它，就是上次释放失败留下的，直接接管。
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { assertSafeId } from "../../files/ids.js";
import { LeafPressError } from "../../shared/errors.js";
import {
  RETRY_MS,
  WAIT_MS,
  discardFolder,
  errorCode,
  folderAgeMs,
  withReaper,
} from "./lock-folder.js";
import {
  type BlogLockOwner,
  PROCESS_INSTANCE,
  busyError,
  readOwner,
  sameOwner,
} from "./lock-owner.js";

/** 持有者开始超过这么久，不管进程还在不在都当作过期 */
const STALE_AFTER_MS = 60 * 60_000;
/** 锁文件夹里读不到持有者信息，且文件夹已存在这么久，就当作建到一半崩了留下的 */
const UNREADABLE_GRACE_MS = 3_000;

/** 本进程正持有的锁：键是锁文件夹（见 lockKey），值是写进 owner.json 的持有者信息 */
const heldLocks = new Map<string, BlogLockOwner>();

/** 博客仓库锁文件夹的位置 */
export function blogLockDir(home: string, accountId: string): string {
  assertSafeId(accountId);
  return join(home, "locks", `blog-${accountId}`);
}

/** 进程内的表用的键：转成绝对路径，Windows 上不分大小写 */
function lockKey(lockDir: string): string {
  const full = resolve(lockDir);
  return process.platform === "win32" ? full.toLowerCase() : full;
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM：进程在，只是没权限给它发信号
    return errorCode(error) === "EPERM";
  }
}

/** 持有者是不是「就是本进程这一次运行」：进程号和运行标记都要对上，光比进程号会被复用的进程号骗 */
function ownedByThisProcess(owner: BlogLockOwner): boolean {
  return owner.pid === process.pid && owner.instance === PROCESS_INSTANCE;
}

/**
 * 持有者还在用这把锁吗？
 * - 超过 60 分钟一律当作过期；
 * - 本进程自己的锁以进程内的表为准：表里有才是正在用，表里没有就是上次释放失败留下的；
 * - 别的进程的锁（含进程号相同但运行标记对不上的）看进程还活着没有。
 */
function ownerIsActive(lockDir: string, owner: BlogLockOwner): boolean {
  const startedAt = Date.parse(owner.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt >= STALE_AFTER_MS)
    return false;
  if (ownedByThisProcess(owner))
    return sameOwner(heldLocks.get(lockKey(lockDir)), owner);
  return processIsAlive(owner.pid);
}

/** 锁文件夹里的持有者已经不在了：复查确实过期再清掉 */
async function removeStaleLock(lockDir: string): Promise<void> {
  await withReaper(lockDir, async () => {
    const holder = await readOwner(lockDir);
    if (holder !== undefined) {
      if (ownerIsActive(lockDir, holder)) return;
    } else {
      const age = await folderAgeMs(lockDir);
      if (age === undefined || age < UNREADABLE_GRACE_MS) return;
    }
    await discardFolder(lockDir, "stale");
  });
}

/** 锁文件夹已经存在时：持有者在用就失败，不在了（含本进程上次没释放干净的）就接管，还没建完就等一会儿 */
async function settleExistingLock(
  lockDir: string,
  deadline: number,
): Promise<void> {
  const holder = await readOwner(lockDir);
  if (holder !== undefined) {
    if (ownerIsActive(lockDir, holder)) throw busyError(holder);
    await removeStaleLock(lockDir);
    return;
  }
  const age = await folderAgeMs(lockDir);
  if (age === undefined) return;
  if (age >= UNREADABLE_GRACE_MS) {
    await removeStaleLock(lockDir);
    return;
  }
  if (Date.now() >= deadline) {
    throw new LeafPressError(
      "STATE_CONFLICT",
      "博客仓库锁正被另一个进程建立，稍后再试",
    );
  }
  await delay(RETRY_MS);
}

async function acquire(lockDir: string, owner: BlogLockOwner): Promise<void> {
  await mkdir(dirname(lockDir), { recursive: true });
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      await mkdir(lockDir);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      await settleExistingLock(lockDir, deadline);
      continue;
    }
    // 文件夹建成的这一刻就登记：之后本进程里别的使用者看到这个文件夹，立刻知道它在用
    const key = lockKey(lockDir);
    heldLocks.set(key, owner);
    try {
      await writeFile(
        join(lockDir, "owner.json"),
        `${JSON.stringify(owner)}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      heldLocks.delete(key);
      await rm(lockDir, { recursive: true, force: true });
      throw error;
    }
    return;
  }
}

async function release(lockDir: string, owner: BlogLockOwner): Promise<void> {
  await withReaper(lockDir, async () => {
    if (sameOwner(await readOwner(lockDir), owner)) {
      await discardFolder(lockDir, "released");
    }
  });
}

/**
 * 释放锁。释放失败不盖掉 run 的结果，但也不再悄悄吞掉：记一条警告。
 * 不管成没成功，本进程都不再持有它；锁文件夹要是留下了，本进程下次使用时会直接接管。
 */
async function releaseOrWarn(
  lockDir: string,
  owner: BlogLockOwner,
  warn: (message: string) => void,
): Promise<void> {
  try {
    await release(lockDir, owner);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(
      `博客仓库锁没有释放干净（${reason}），锁文件夹留在 ${lockDir}。本进程下次使用时会直接接管；别的进程要等它过期（最长 60 分钟）`,
    );
  } finally {
    const key = lockKey(lockDir);
    // 只删自己登记的那一条：超过 60 分钟被本进程别的使用者接管后，那一条是人家的
    if (heldLocks.get(key) === owner) heldLocks.delete(key);
  }
}

/**
 * 拿到博客仓库锁后执行 run，结束（成功或抛错）都释放。
 * step 是给人看的步骤名（出现在「正在被另一次「…」使用」的提示里）。
 * warn：释放失败时的提醒去哪儿，缺省写到标准错误。
 */
export async function withBlogRepoLock<T>(input: {
  home: string;
  accountId: string;
  workId: string;
  step: string;
  warn?: (message: string) => void;
  run(): Promise<T>;
}): Promise<T> {
  const lockDir = blogLockDir(input.home, input.accountId);
  const owner: BlogLockOwner = {
    pid: process.pid,
    instance: PROCESS_INSTANCE,
    startedAt: new Date().toISOString(),
    step: input.step,
    workId: input.workId,
  };
  await acquire(lockDir, owner);
  try {
    return await input.run();
  } finally {
    await releaseOrWarn(
      lockDir,
      owner,
      input.warn ??
        ((message) => {
          process.stderr.write(`注意：${message}\n`);
        }),
    );
  }
}
