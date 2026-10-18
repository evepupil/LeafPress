/**
 * 进度流水：项目里 docs/进度/<YYYY-MM-DD>.md 的读取和解析。
 * 从 devlog.ts 拆出来：这一块只碰文件系统（不跑 git），可以单独测。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DevActivity } from "./types.js";

/** 进度流水文件最多收 10 个 */
export const MAX_LOG_FILES = 10;
/** 进度流水目录：项目下的 docs/进度 */
export const PROGRESS_DIR = ["docs", "进度"];
/** 进度流水文件名：YYYY-MM-DD.md */
const LOG_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * 进度流水文件名里的日期（YYYY-MM-DD）；不是这个样子的文件返回 undefined。
 * 光看形状会把 2026-02-31.md 这种不存在的日期也当真，所以再按日历校验一遍。
 */
function logFileDay(name: string): string | undefined {
  const match = LOG_FILE_PATTERN.exec(name);
  const day = match?.[1];
  if (day === undefined) return undefined;
  const [year, month, date] = day.split("-").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    date === undefined ||
    month < 1 ||
    month > 12 ||
    date < 1 ||
    date > daysInMonth(year, month)
  )
    return undefined;
  return day;
}

/** 那个月有多少天（闰年的二月也算） */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, -1, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/**
 * 读一个项目的进度流水：docs/进度 下文件名是 YYYY-MM-DD.md、日期不早于 since 的，
 * 新的在前取 10 个；每个文件只收二级标题（「## 」开头的行，去掉井号和首尾空白）。
 * 目录不存在或读不了当没有进度流水；单个文件读不了就跳过它。
 */
export function readProgressLogs(
  path: string,
  since: string,
): DevActivity["logs"] {
  const dir = join(path, ...PROGRESS_DIR);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const dated = names
    .map((name) => ({ name, day: logFileDay(name) }))
    .filter(
      (entry): entry is { name: string; day: string } =>
        entry.day !== undefined && entry.day >= since,
    );
  // 日期新的在前；同一天理论上不该有两个文件，万一有就按文件名稳定排
  dated.sort((a, b) =>
    a.day < b.day ? 1 : a.day > b.day ? -1 : a.name.localeCompare(b.name),
  );
  const logs: DevActivity["logs"] = [];
  for (const entry of dated.slice(0, MAX_LOG_FILES)) {
    let content: string;
    try {
      content = readFileSync(join(dir, entry.name), "utf8");
    } catch {
      continue;
    }
    logs.push({ file: entry.name, headings: parseHeadings(content) });
  }
  return logs;
}

/** 二级标题：「## 」开头的行；「### 」开头的更深层不算（它算在最近的二级标题下面） */
function parseHeadings(content: string): string[] {
  const headings: string[] = [];
  // 文件开头可能带 UTF-8 BOM：不去掉的话第一行的「## 标题」匹配不上
  const text = content.startsWith("\uFEFF") ? content.slice(1) : content;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.startsWith("## ") || rawLine.startsWith("### ")) continue;
    const heading = rawLine.slice(3).trim();
    if (heading !== "") headings.push(heading);
  }
  return headings;
}
