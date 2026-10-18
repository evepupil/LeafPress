import { existsSync } from "node:fs";
import {
  addDays,
  devlogKey,
  isoWeek,
  scoreDevlog,
  type DevlogPayload,
  type IdeaCandidate,
} from "@leafpress/core";
import type { ReadDevActivity } from "../ideas/types.js";
import type { ExecFn } from "../shared/exec.js";

export type DevlogDraft = Omit<
  IdeaCandidate,
  "id" | "firstSeenAt" | "updatedAt" | "state"
>;

/** 没有显式配置时，Windows 仅在 C:\\code 确实存在时读取；参数可替换，单测不依赖运行机器的目录。 */
export function resolveDevRoots(
  configured: readonly string[] | undefined,
  platform: NodeJS.Platform = process.platform,
  pathExists: (path: string) => boolean = existsSync,
): readonly string[] {
  if (configured !== undefined) return configured;
  return platform === "win32" && pathExists("C:\\code") ? ["C:\\code"] : [];
}

export async function findDevlogDrafts(input: {
  readDevActivity: ReadDevActivity;
  roots: readonly string[];
  exec: ExecFn;
  today: string;
}): Promise<DevlogDraft[]> {
  const activities = await input.readDevActivity({
    roots: input.roots,
    since: addDays(input.today, -6),
    exec: input.exec,
  });
  const week = isoWeek(input.today);
  return activities.slice(0, 5).map((activity) => {
    const payload: DevlogPayload = {
      kind: "devlog",
      repo: activity.repo,
      path: activity.path,
      week,
      commits: activity.commits,
      logs: activity.logs,
    };
    return {
      key: devlogKey(activity.path, week),
      kind: "devlog",
      title: activity.repo,
      score: scoreDevlog(payload),
      payload,
    };
  });
}
