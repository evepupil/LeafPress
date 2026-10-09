/**
 * 任务文件夹里的两份凭据：检查通过的 .gate.json、推送完成的 .publish.json。
 *
 * .gate.json 只在三项检查全过时写，publish 靠它确认「推出去的就是检查过的稿子」；
 * .publish.json 记着推出去的提交，写完它才算推送完成。
 */
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { writeFileAtomic } from "../../../files/atomic.js";

const GATE_FILE = ".gate.json";
const PUBLISH_FILE = ".publish.json";
const REPORT_FILE = "检查结果.txt";

export interface GateRecord {
  passed: true;
  slug: string;
  /** 稿子的指纹，见 hashDraft */
  hash: string;
  /** 检查时博客线上 main 的提交号 */
  base: string;
  checkedAt: string;
}

export interface PublishRecord {
  slug: string;
  /** 推到线上的提交号 */
  commit: string;
  pushedAt: string;
}

async function removeIfPresent(folder: string, name: string): Promise<void> {
  await rm(join(folder, name), { force: true });
}

function writeJson(folder: string, name: string, value: unknown): void {
  writeFileAtomic(join(folder, name), `${JSON.stringify(value, null, 2)}\n`);
}

/** 读检查凭据；没有、坏了、没通过都当作没有 */
export async function readGateRecord(
  folder: string,
): Promise<GateRecord | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(folder, GATE_FILE), "utf8"));
  } catch {
    return undefined;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "passed" in parsed &&
    parsed.passed === true &&
    "slug" in parsed &&
    typeof parsed.slug === "string" &&
    "hash" in parsed &&
    typeof parsed.hash === "string" &&
    "base" in parsed &&
    typeof parsed.base === "string" &&
    "checkedAt" in parsed &&
    typeof parsed.checkedAt === "string"
  ) {
    return {
      passed: true,
      slug: parsed.slug,
      hash: parsed.hash,
      base: parsed.base,
      checkedAt: parsed.checkedAt,
    };
  }
  return undefined;
}

export function writeGateRecord(folder: string, record: GateRecord): void {
  writeJson(folder, GATE_FILE, record);
}

export function writePublishRecord(
  folder: string,
  record: PublishRecord,
): void {
  writeJson(folder, PUBLISH_FILE, record);
}

/** 重新检查前把上一轮的检查凭据和报告作废，免得这轮没跑成时被当成「检查过了」 */
export async function clearGateOutputs(folder: string): Promise<void> {
  await removeIfPresent(folder, GATE_FILE);
  await removeIfPresent(folder, REPORT_FILE);
}

/** 重新推送前把上一轮的推送凭据作废 */
export async function clearPublishRecord(folder: string): Promise<void> {
  await removeIfPresent(folder, PUBLISH_FILE);
}

/** 写 检查结果.txt */
export function writeCheckReport(folder: string, text: string): void {
  writeFileAtomic(join(folder, REPORT_FILE), text);
}
