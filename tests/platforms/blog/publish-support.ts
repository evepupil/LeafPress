/**
 * publish 步骤几个测试文件共用的小工具。
 */
import { expect } from "vitest";

import { publishBlogDraft } from "../../../src/platforms/blog/steps/publish.js";
import {
  type BlogFixture,
  SLUG,
  makeBlogFixture,
  readTaskFile,
  writeGate,
} from "./steps-fixtures.js";

export const ZH_PATH = `content/posts/zh/${SLUG}.mdx`;
export const EN_PATH = `content/posts/en/${SLUG}.mdx`;
export const IMAGE_PATH = `public/images/posts/${SLUG}/cover.png`;

export const HASH_MISMATCH =
  "稿子在检查之后改过：先运行 leafpress work back b-1 4 重新跑检查";

/** 先让检查「已经过了」，再跑 publish，并证明作者工作区在整个过程中一个字节没动 */
export async function publish(fixture: BlogFixture, gate = true) {
  if (gate) await writeGate(fixture);
  const before = await fixture.snapshotAuthor();
  const outcome = await publishBlogDraft(fixture.ctx);
  expect(await fixture.snapshotAuthor()).toEqual(before);
  return outcome;
}

export async function withFixture(
  run: (fixture: BlogFixture) => Promise<void>,
  options: Parameters<typeof makeBlogFixture>[0] = {},
): Promise<void> {
  const fixture = await makeBlogFixture(options);
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

/** 在「线上」（本地裸仓库）里跑 git */
export function remoteGit(fixture: BlogFixture, args: string[]) {
  return fixture.git(["--git-dir", fixture.remote, ...args], fixture.base);
}

/** 线上某个提交的主题、作者、父提交和改动的文件 */
export async function commitInfo(fixture: BlogFixture, rev: string) {
  const [subject, author, parents] = (
    await remoteGit(fixture, ["log", "-1", "--format=%s%n%an%n%P", rev])
  ).split("\n");
  const files = (
    await remoteGit(fixture, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "--root",
      rev,
    ])
  )
    .split("\n")
    .filter(Boolean)
    .sort();
  return {
    subject,
    author,
    parents: (parents ?? "").split(" ").filter(Boolean),
    files,
  };
}

export async function readPublished(fixture: BlogFixture) {
  return JSON.parse(await readTaskFile(fixture, ".publish.json")) as {
    slug: string;
    commit: string;
    pushedAt: string;
  };
}

export function pushCalls(fixture: BlogFixture) {
  return fixture.gitCalls.filter((call) => call.args[0] === "push");
}

export function gitSubcommands(fixture: BlogFixture, name: string) {
  return fixture.gitCalls.filter((call) => call.args.includes(name));
}

/** 把本次提交接到最新 main 上的变基调用（不含重置检出目录时顺手的 rebase --abort） */
export function rebaseOntoOnline(fixture: BlogFixture) {
  return fixture.gitCalls.filter(
    (call) => call.args[0] === "rebase" && call.args[1] === "origin/main",
  );
}

/** 第一次推送之后调用过的 git 命令 */
export function callsAfterFirstPush(fixture: BlogFixture) {
  const first = fixture.gitCalls.findIndex((call) => call.args[0] === "push");
  return first < 0 ? [] : fixture.gitCalls.slice(first);
}
