/**
 * 博客仓库锁里的持有者信息：owner.json 的内容、读出来、认是不是同一个持有者、给人看的提示。
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { LeafPressError } from "../../shared/errors.js";

/**
 * 本进程这一次运行的标记，每次启动都不同。
 * 光比进程号不够：进程退出后，进程号会被系统分给别的进程，「锁里的进程号和我一样」
 * 既可能是我自己，也可能是早已退出的、碰巧同号的前一个进程。
 * 写进持有者信息的这个标记，才能确定「就是这一次运行的我」。
 */
export const PROCESS_INSTANCE = randomUUID();

/** 写在锁文件夹里 owner.json 的内容 */
export interface BlogLockOwner {
  pid: number;
  /** 持有者所在进程的运行标记，见 PROCESS_INSTANCE；旧版本写的锁里没有这一项 */
  instance?: string;
  startedAt: string;
  step: string;
  workId: string;
}

/** 读锁文件夹里的持有者信息；文件不在、写了一半、格式不对都返回 undefined */
export async function readOwner(
  lockDir: string,
): Promise<BlogLockOwner | undefined> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(lockDir, "owner.json"), "utf8"),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "pid" in parsed &&
      typeof parsed.pid === "number" &&
      "startedAt" in parsed &&
      typeof parsed.startedAt === "string" &&
      "step" in parsed &&
      typeof parsed.step === "string" &&
      "workId" in parsed &&
      typeof parsed.workId === "string"
    ) {
      return {
        pid: parsed.pid,
        ...("instance" in parsed && typeof parsed.instance === "string"
          ? { instance: parsed.instance }
          : {}),
        startedAt: parsed.startedAt,
        step: parsed.step,
        workId: parsed.workId,
      };
    }
  } catch {
    // 文件不在或写了一半：按「没有持有者信息」处理
  }
  return undefined;
}

/** 两份持有者信息是不是同一次持有（逐项相同） */
export function sameOwner(
  left: BlogLockOwner | undefined,
  right: BlogLockOwner,
): boolean {
  return (
    left !== undefined &&
    left.pid === right.pid &&
    left.instance === right.instance &&
    left.startedAt === right.startedAt &&
    left.step === right.step &&
    left.workId === right.workId
  );
}

function startLabel(startedAt: string): string {
  const date = new Date(startedAt);
  if (!Number.isFinite(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** 锁被别人占着时给用户的提示：谁在用、哪个作品、几点开始 */
export function busyError(holder: BlogLockOwner): LeafPressError {
  return new LeafPressError(
    "STATE_CONFLICT",
    `博客仓库正在被另一次「${holder.step}」使用（作品 ${holder.workId}，${startLabel(holder.startedAt)} 开始），等它跑完再试`,
  );
}
