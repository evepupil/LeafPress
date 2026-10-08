import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { FeedbackEntry, TaskState, WorkLog } from "@leafpress/core";

import type { HomePaths } from "../config/home.js";
import { writeFileAtomic } from "./atomic.js";
import { assertSafeId } from "./ids.js";
import { LeafPressError } from "../shared/errors.js";

export const MIRROR_FILES = [
  "作品.md",
  "状态.json",
  "要你做的事.md",
  "你的反馈.md",
  "记录.log",
] as const;

export interface TaskMirror {
  workId: string;
  context: string;
  state: TaskState;
  ask?: string;
  feedback: FeedbackEntry[];
  log: WorkLog[];
}

export function taskFolderPath(paths: HomePaths, workId: string): string {
  assertSafeId(workId);
  return join(paths.tasksDir, workId);
}

function timeLabel(at: string): string {
  return at.slice(0, 16).replace("T", " ");
}

function feedbackText(entries: readonly FeedbackEntry[]): string {
  return `${entries.map((entry) => `## ${timeLabel(entry.at)}（${entry.stepName}）\n\n${entry.text}`).join("\n\n")}\n`;
}

function logText(entries: readonly WorkLog[]): string {
  return entries.length === 0
    ? ""
    : `${entries
        .map(
          (entry) =>
            `${timeLabel(entry.at)}  ${entry.text.replace(/\r\n?|\n/g, " ")}`,
        )
        .join("\n")}\n`;
}

function removeIfPresent(path: string): void {
  rmSync(path, { force: true });
}

function attemptWrite(
  filename: string,
  action: () => void,
  failures: string[],
): void {
  try {
    action();
  } catch {
    failures.push(filename);
  }
}

export function writeTaskMirror(paths: HomePaths, mirror: TaskMirror): void {
  const folder = taskFolderPath(paths, mirror.workId);
  try {
    mkdirSync(folder, { recursive: true });
  } catch {
    throw new LeafPressError("STORE_FAILED", `任务文件写入失败：${folder}`);
  }

  const failures: string[] = [];
  attemptWrite(
    MIRROR_FILES[0],
    () => writeFileAtomic(join(folder, MIRROR_FILES[0]), `${mirror.context}\n`),
    failures,
  );
  attemptWrite(
    MIRROR_FILES[1],
    () =>
      writeFileAtomic(
        join(folder, MIRROR_FILES[1]),
        `${JSON.stringify(mirror.state, null, 2)}\n`,
      ),
    failures,
  );

  const askPath = join(folder, MIRROR_FILES[2]);
  attemptWrite(
    MIRROR_FILES[2],
    () => {
      if (mirror.ask === undefined) removeIfPresent(askPath);
      else writeFileAtomic(askPath, `${mirror.ask}\n`);
    },
    failures,
  );

  const feedbackPath = join(folder, MIRROR_FILES[3]);
  attemptWrite(
    MIRROR_FILES[3],
    () => {
      if (mirror.feedback.length === 0) removeIfPresent(feedbackPath);
      else writeFileAtomic(feedbackPath, feedbackText(mirror.feedback));
    },
    failures,
  );
  attemptWrite(
    MIRROR_FILES[4],
    () => writeFileAtomic(join(folder, MIRROR_FILES[4]), logText(mirror.log)),
    failures,
  );

  if (failures.length > 0)
    throw new LeafPressError(
      "STORE_FAILED",
      `任务说明文件写入失败：${failures.join("、")}`,
    );
}

function visitFiles(root: string, current: string, output: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      visitFiles(root, absolute, output);
    } else if (entry.isFile()) {
      const path = relative(root, absolute).split(sep).join("/");
      if (
        !path.includes("/") &&
        (MIRROR_FILES as readonly string[]).includes(path)
      )
        continue;
      output.push(path);
    }
  }
}

export function listTaskFiles(paths: HomePaths, workId: string): string[] {
  const folder = taskFolderPath(paths, workId);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return [];
  const files: string[] = [];
  visitFiles(folder, folder, files);
  return files.sort();
}

function resolveTaskName(folder: string, name: string): string | undefined {
  if (name.length === 0 || name.startsWith("/") || name.includes("\\"))
    return undefined;
  const target = resolve(folder, ...name.split("/"));
  const prefix = `${resolve(folder)}${sep}`;
  return target.startsWith(prefix) ? target : undefined;
}

export function missingFiles(
  paths: HomePaths,
  workId: string,
  names: readonly string[],
): string[] {
  const folder = taskFolderPath(paths, workId);
  return names.filter((name) => {
    const target = resolveTaskName(folder, name);
    return target === undefined || !existsSync(target);
  });
}
