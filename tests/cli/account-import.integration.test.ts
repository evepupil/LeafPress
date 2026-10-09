import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImportSummary } from "@leafpress/core";
import { buildCli, invoke, runCli } from "./data-report-helpers.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(repoRoot, "dist", "cli", "main.js");

let tempHome: string;
let tempRepoBase: string;

beforeAll(() => {
  buildCli();
  tempHome = mkdtempSync(join(tmpdir(), "leafpress-import-home-"));
  tempRepoBase = mkdtempSync(join(tmpdir(), "leafpress-import-repo-"));
}, 120_000);

afterAll(() => {
  for (const dir of [tempHome, tempRepoBase])
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
});

/** 博客文章的写法和博客仓库一致，照 tests/platforms/blog/import.test.ts 的 postText */
function postText(options: {
  title: string;
  published?: string;
  draft?: boolean;
}): string {
  return [
    "---",
    `title: "${options.title}"`,
    'description: "测试"',
    `published: "${options.published ?? "2026-09-20"}"`,
    'locale: "zh-CN"',
    'tags: ["test"]',
    `draft: ${String(options.draft ?? false)}`,
    "---",
    "",
    "正文。",
    "",
  ].join("\n");
}

function git(args: readonly string[], cwd: string): void {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      `git ${args.join(" ")} 失败（${result.status}）：${result.stderr}`,
    );
}

let repoSerial = 0;

/** 搭博客作者仓库和本地裸仓库当线上，2 篇已发、1 篇草稿，全部推上 origin/main；每次调一个新目录 */
function buildBlogRepo(): string {
  repoSerial += 1;
  const base = join(tempRepoBase, `repo-${repoSerial}`);
  const repo = join(base, "repo");
  const remote = join(base, "remote.git");
  mkdirSync(base, { recursive: true });
  mkdirSync(repo, { recursive: true });
  git(["init", "--bare", "--initial-branch=main", remote], base);
  git(["init", "--initial-branch=main"], repo);
  git(["config", "user.name", "Test Author"], repo);
  git(["config", "user.email", "author@example.invalid"], repo);
  git(["config", "core.autocrlf", "false"], repo);
  mkdirSync(join(repo, "content", "posts", "zh"), { recursive: true });
  writeFileSync(
    join(repo, "content", "posts", "zh", "post-one.mdx"),
    postText({ title: "第一篇" }),
    "utf8",
  );
  writeFileSync(
    join(repo, "content", "posts", "zh", "post-two.mdx"),
    postText({ title: "第二篇", published: "2026-09-25" }),
    "utf8",
  );
  writeFileSync(
    join(repo, "content", "posts", "zh", "draft-one.mdx"),
    postText({ title: "草稿", draft: true }),
    "utf8",
  );
  git(["add", "-A"], repo);
  git(["commit", "-m", "初始提交"], repo);
  git(["remote", "add", "origin", remote], repo);
  git(["push", "--set-upstream", "origin", "main"], repo);
  return repo;
}

function parseSummary(output: string): ImportSummary {
  const parsed = JSON.parse(output) as { ok: boolean; summary: ImportSummary };
  expect(parsed.ok).toBe(true);
  return parsed.summary;
}

describe("leafpress account import 集成", () => {
  it(
    "init → 加博客账号 → 配 repo-path 和 site-url → 导入 → 再导入",
    { timeout: 120_000 },
    () => {
      invoke(tempHome, ["--json", "init"]);
      const added = JSON.parse(
        invoke(tempHome, [
          "--json",
          "account",
          "add",
          "--platform",
          "blog",
          "--name",
          "测试博客",
        ]),
      ) as { account: { id: string } };
      const accountId = added.account.id;
      expect(accountId).toMatch(/^blog-/);

      const repo = buildBlogRepo();
      invoke(tempHome, [
        "--json",
        "account",
        "set",
        accountId,
        "repo-path",
        repo,
      ]);
      invoke(tempHome, [
        "--json",
        "account",
        "set",
        accountId,
        "site-url",
        "https://blog.example.test/",
      ]);

      const humanSet = invoke(tempHome, [
        "account",
        "set",
        accountId,
        "site-url",
        "https://blog.example.test/",
      ]);
      expect(humanSet.split("\n")).toEqual(["已保存：站点地址", ""]);

      const human = runCli(tempHome, ["account", "import", accountId]);
      expect(human.status).toBe(0);
      expect(human.stdout.split("\n")).toEqual([
        "导入 2 篇，0 篇已经有了",
        "跳过 1 篇草稿",
        "",
      ]);

      const first = parseSummary(
        invoke(tempHome, ["--json", "account", "import", accountId]),
      );
      expect(first.added).toBe(0);
      expect(first.skipped).toBe(2);
      expect(first.drafts).toBe(1);

      const second = parseSummary(
        invoke(tempHome, ["--json", "account", "import", accountId]),
      );
      expect(second.added).toBe(0);
      expect(second.skipped).toBe(2);
    },
  );

  it(
    "import --json 里作品只带 id、标题、链接、发布日期",
    { timeout: 120_000 },
    () => {
      const repo = buildBlogRepo();
      invoke(tempHome, ["--json", "init"]);
      const added = JSON.parse(
        invoke(tempHome, [
          "--json",
          "account",
          "add",
          "--platform",
          "blog",
          "--name",
          "瘦身测试",
        ]),
      ) as { account: { id: string } };
      invoke(tempHome, [
        "--json",
        "account",
        "set",
        added.account.id,
        "repo-path",
        repo,
      ]);
      invoke(tempHome, [
        "--json",
        "account",
        "set",
        added.account.id,
        "site-url",
        "https://blog.example.test/",
      ]);
      const summary = parseSummary(
        invoke(tempHome, ["--json", "account", "import", added.account.id]),
      );
      expect(summary.added).toBe(2);
      for (const work of summary.works) {
        expect(Object.keys(work).sort()).toEqual([
          "id",
          "publishedAt",
          "title",
          "url",
        ]);
      }
    },
  );

  it(
    "密钥走 --stdin，值不出现在标准输出和标准错误里",
    { timeout: 120_000 },
    () => {
      invoke(tempHome, ["--json", "init"]);
      const added = JSON.parse(
        invoke(tempHome, [
          "--json",
          "account",
          "add",
          "--platform",
          "blog",
          "--name",
          "密钥测试",
        ]),
      ) as { account: { id: string } };
      const accountId = added.account.id;

      const stdinResult = spawnSync(
        process.execPath,
        [
          cli,
          "--home",
          tempHome,
          "account",
          "set",
          accountId,
          "umami-share",
          "--stdin",
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: 30_000,
          input: "FAKE-SECRET-123\n",
        },
      );
      expect(stdinResult.status).toBe(0);
      expect(stdinResult.stdout.split("\n")).toEqual([
        "已保存：Umami 共享链接",
        "",
      ]);
      expect(stdinResult.stdout).not.toContain("FAKE-SECRET-123");
      expect(stdinResult.stderr).not.toContain("FAKE-SECRET-123");

      const directJson = runCli(tempHome, [
        "--json",
        "account",
        "set",
        accountId,
        "umami-share",
        "FAKE-SECRET-123",
      ]);
      expect(directJson.status).toBe(0);
      expect(directJson.stdout).not.toContain("FAKE-SECRET-123");
      expect(directJson.stderr).not.toContain("FAKE-SECRET-123");

      const unknown = runCli(tempHome, [
        "account",
        "set",
        accountId,
        "repo-path-x",
        "FAKE-SECRET-123",
      ]);
      expect(unknown.status).toBe(2);
      expect(unknown.stdout).not.toContain("FAKE-SECRET-123");
      expect(unknown.stderr).not.toContain("FAKE-SECRET-123");
      expect(unknown.stderr).toContain(
        "博客的配置项：repo-path（博客仓库位置）、site-url（站点地址）、umami-share（Umami 共享链接）",
      );
    },
  );
});
