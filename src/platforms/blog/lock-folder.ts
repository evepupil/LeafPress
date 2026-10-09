/**
 * 博客仓库锁用到的文件夹操作：文件夹存在多久、改名成墓碑再删（带退避重试）、「.reaper」短锁。
 */
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { LeafPressError } from "../../shared/errors.js";

/** 「.reaper」短锁留了这么久还没人删，当作持有它的进程崩了 */
const REAPER_STALE_MS = 30_000;
/** 等别人把锁建完、或等短锁让出来，最多等这么久 */
export const WAIT_MS = 5_000;
export const RETRY_MS = 50;
/**
 * Windows 上给文件夹改名，常被杀毒软件、索引服务或别的进程正在读里面的 owner.json 占住
 * （EPERM / EBUSY / EACCES）。退避着多试几次：每次试之前等的毫秒数，合计约 2 秒。
 */
const RENAME_RETRY_DELAYS_MS = [50, 100, 200, 400, 800, 450];

export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

/** 文件夹存在了多久；不存在返回 undefined */
export async function folderAgeMs(path: string): Promise<number | undefined> {
  try {
    return Math.max(0, Date.now() - (await stat(path)).mtimeMs);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

/** 把文件夹改名成墓碑再删掉；Windows 上被临时占住时退避着多试几次 */
export async function discardFolder(
  path: string,
  label: string,
): Promise<void> {
  const tombstone = `${path}.${label}-${randomUUID()}`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(path, tombstone);
      break;
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT") return;
      const retryable =
        code === "EPERM" || code === "EBUSY" || code === "EACCES";
      const wait = RENAME_RETRY_DELAYS_MS[attempt];
      if (!retryable || wait === undefined) throw error;
      await delay(wait);
    }
  }
  // 改名成功锁就已经放开了；墓碑删不干净只是留点垃圾，不能算释放失败
  await rm(tombstone, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  }).catch(() => undefined);
}

/** 清理和释放都要先拿的短锁，保证「复查再删除」中间不会有别人插进来 */
export async function withReaper<T>(
  lockDir: string,
  run: () => Promise<T>,
): Promise<T> {
  const reaper = `${lockDir}.reaper`;
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      await mkdir(reaper);
      break;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const age = await folderAgeMs(reaper);
      if (age !== undefined && age >= REAPER_STALE_MS) {
        await rm(reaper, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new LeafPressError("STATE_CONFLICT", "博客仓库锁正忙，稍后再试");
      }
      await delay(RETRY_MS);
    }
  }
  try {
    return await run();
  } finally {
    await rm(reaper, { recursive: true, force: true });
  }
}
