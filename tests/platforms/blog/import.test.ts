import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createBlogImporter } from "../../../src/platforms/blog/import.js";
import {
  withBlogRepoLock,
  blogLockDir,
} from "../../../src/platforms/blog/lock.js";
import type {
  ImportContext,
  ImportListing,
  ImportOutcome,
} from "../../../src/platforms/types.js";
import {
  ACCOUNT_ID,
  type BlogFixture,
  exists,
  makeBlogFixture,
} from "./steps-fixtures.js";

interface PostOptions {
  title: string;
  published?: string;
  tags?: string[];
  draft?: boolean;
  locale?: "zh-CN" | "en";
}

/** 一篇博客文章；frontmatter 的写法和博客仓库一致 */
function postText(options: PostOptions): string {
  return [
    "---",
    `title: "${options.title}"`,
    'description: "测试"',
    `published: "${options.published ?? "2026-09-20"}"`,
    `locale: "${options.locale ?? "zh-CN"}"`,
    `tags: [${(options.tags ?? ["test"]).map((tag) => `"${tag}"`).join(", ")}]`,
    `draft: ${String(options.draft ?? false)}`,
    "---",
    "",
    "正文。",
    "",
  ].join("\n");
}

function importContext(
  fixture: BlogFixture,
  overrides: Partial<ImportContext> = {},
): ImportContext {
  return {
    account: fixture.ctx.account,
    home: fixture.home,
    setting: (key) => fixture.ctx.setting(key),
    exec: fixture.ctx.exec,
    today: "2026-10-09",
    ...overrides,
  };
}

function listed(outcome: ImportOutcome): ImportListing {
  if (!outcome.ok) throw new Error(`导入失败：${outcome.reason}`);
  return outcome.listing;
}

/** 夹具关闭前，作者工作区必须和开始时一个字节不差 */
async function withFixture(
  run: (fixture: BlogFixture) => Promise<void>,
): Promise<void> {
  const fixture = await makeBlogFixture();
  try {
    const before = await fixture.snapshotAuthor();
    await run(fixture);
    expect(await fixture.snapshotAuthor()).toEqual(before);
  } finally {
    await fixture.close();
  }
}

describe("导入博客已有文章", () => {
  it("列出线上 main 上已发布的中文文章：作者本地还没拉的也在；英文不单独成作品；草稿跳过并计数；读不了的原样进 issues", async () => {
    await withFixture(async (fixture) => {
      await fixture.pushFromElsewhere(
        {
          "content/posts/zh/online-only.mdx": postText({
            title: "只在线上的文章",
            published: "2026-09-20",
            tags: ["a", "b"],
          }),
          "content/posts/zh/old-note.md": postText({
            title: "老笔记",
            published: "2026-03-01",
            tags: [],
          }),
          "content/posts/zh/你好 世界.mdx": postText({
            title: "中文文件名",
            published: "2026-09-01",
          }),
          "content/posts/zh/draft-one.mdx": postText({
            title: "草稿",
            draft: true,
          }),
          "content/posts/zh/broken.mdx":
            "---\ntitle: 没有别的字段\n---\n正文\n",
          "content/posts/en/english-only.mdx": postText({
            title: "English only",
            locale: "en",
          }),
        },
        "Notion 同步了几篇",
      );
      const before = await fixture.snapshotAuthor();

      const listing = listed(
        await createBlogImporter().list(importContext(fixture)),
      );

      const zh = (name: string): string =>
        join(fixture.repo, "content", "posts", "zh", name);
      expect(listing.candidates).toEqual([
        {
          sourceRef: "zh/existing-post",
          title: "已有文章",
          url: "https://blog.example.test/posts/existing-post/",
          publishedAt: "2026-10-08",
          localPath: zh("existing-post.mdx"),
          tags: ["test"],
        },
        {
          sourceRef: "zh/online-only",
          title: "只在线上的文章",
          url: "https://blog.example.test/posts/online-only/",
          publishedAt: "2026-09-20",
          localPath: zh("online-only.mdx"),
          tags: ["a", "b"],
        },
        {
          sourceRef: "zh/你好 世界",
          title: "中文文件名",
          url: "https://blog.example.test/posts/%E4%BD%A0%E5%A5%BD%20%E4%B8%96%E7%95%8C/",
          publishedAt: "2026-09-01",
          localPath: zh("你好 世界.mdx"),
          tags: ["test"],
        },
        {
          sourceRef: "zh/old-note",
          title: "老笔记",
          url: "https://blog.example.test/posts/old-note/",
          publishedAt: "2026-03-01",
          localPath: zh("old-note.md"),
          tags: [],
        },
      ]);
      expect(listing.drafts).toBe(1);
      expect(listing.issues).toHaveLength(1);
      expect(listing.issues[0]?.path).toBe(zh("broken.mdx"));
      expect(listing.issues[0]?.message).toContain("published");
      // 作者本地没有这篇，但 localPath 指向的是作者仓库里它该在的位置
      expect(await exists(zh("online-only.mdx"))).toBe(false);
      expect(await fixture.snapshotAuthor()).toEqual(before);
    });
  }, 120_000);

  it("只准备检出目录，不装依赖；用完释放仓库锁", async () => {
    await withFixture(async (fixture) => {
      listed(await createBlogImporter().list(importContext(fixture)));

      expect(fixture.pnpm.calls).toEqual([]);
      expect(await exists(fixture.checkoutDir)).toBe(true);
      expect(await exists(join(fixture.checkoutDir, "node_modules"))).toBe(
        false,
      );
      expect(await exists(blogLockDir(fixture.home, ACCOUNT_ID))).toBe(false);
    });
  }, 120_000);

  it("再导入一次：检出目录重置到线上最新，新发的文章也列得出来", async () => {
    await withFixture(async (fixture) => {
      const importer = createBlogImporter();
      const first = listed(await importer.list(importContext(fixture)));
      expect(first.candidates.map((candidate) => candidate.sourceRef)).toEqual([
        "zh/existing-post",
      ]);

      await fixture.pushFromElsewhere(
        { "content/posts/zh/newer.mdx": postText({ title: "新文章" }) },
        "又发了一篇",
      );
      const second = listed(await importer.list(importContext(fixture)));

      expect(second.candidates.map((candidate) => candidate.sourceRef)).toEqual(
        ["zh/existing-post", "zh/newer"],
      );
    });
  }, 120_000);

  it("没配仓库位置、没配站点地址：直接失败，提示去接入里填，不碰 git", async () => {
    await withFixture(async (fixture) => {
      const importer = createBlogImporter();

      expect(
        await importer.list(
          importContext(fixture, {
            setting: (key) =>
              key === "repo-path" ? undefined : fixture.ctx.setting(key),
          }),
        ),
      ).toEqual({
        ok: false,
        reason: "博客仓库位置还没配",
        fixHint: "在账号详情 · 接入里填",
      });
      expect(
        await importer.list(
          importContext(fixture, {
            setting: (key) =>
              key === "site-url" ? "  " : fixture.ctx.setting(key),
          }),
        ),
      ).toEqual({
        ok: false,
        reason: "站点地址还没配",
        fixHint: "在账号详情 · 接入里填",
      });
      expect(fixture.gitCalls).toEqual([]);
    });
  }, 120_000);

  it("检出目录和仓库锁放在上下文给的数据目录里，不在别处", async () => {
    await withFixture(async (fixture) => {
      const home = join(fixture.base, "another-home");
      let lockSeen = false;
      const base = fixture.ctx.exec;
      const outcome = await createBlogImporter().list(
        importContext(fixture, {
          home,
          exec: async (command, args, options) => {
            // 跑 git 的这一刻仓库锁应该已经在上下文给的数据目录里
            lockSeen ||= await exists(blogLockDir(home, ACCOUNT_ID));
            return base(command, args, options);
          },
        }),
      );

      listed(outcome);
      expect(lockSeen).toBe(true);
      expect(await exists(join(home, "blog-checkout", ACCOUNT_ID))).toBe(true);
      expect(await exists(blogLockDir(home, ACCOUNT_ID))).toBe(false);
      expect(await exists(fixture.checkoutDir)).toBe(false);
    });
  }, 120_000);

  it("博客仓库正被别的步骤占着：立即失败并说明谁在用，等它跑完就能导入", async () => {
    await withFixture(async (fixture) => {
      const importer = createBlogImporter();
      let release: () => void = () => undefined;
      const holding = new Promise<void>((resolve) => {
        release = resolve;
      });
      let acquired: () => void = () => undefined;
      const hasLock = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const holder = withBlogRepoLock({
        home: fixture.home,
        accountId: ACCOUNT_ID,
        workId: "b-9",
        step: "跑博客检查",
        run: () => {
          acquired();
          return holding;
        },
      });
      await hasLock;

      const busy = await importer.list(importContext(fixture));

      expect(busy.ok).toBe(false);
      if (!busy.ok) {
        expect(busy.reason).toMatch(
          /^博客仓库正在被另一次「跑博客检查」使用（作品 b-9，.+开始），等它跑完再试$/,
        );
      }
      expect(fixture.gitCalls).toEqual([]);

      release();
      await holder;
      listed(await importer.list(importContext(fixture)));
    });
  }, 120_000);

  it("拉不到线上（fetch 失败）：失败并说明，不建检出目录", async () => {
    const fixture = await makeBlogFixture();
    try {
      await fixture.git([
        "remote",
        "set-url",
        "origin",
        join(fixture.base, "不存在的远程"),
      ]);
      const before = await fixture.snapshotAuthor();

      const outcome = await createBlogImporter().list(importContext(fixture));

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toMatch(/^博客仓库 fetch 失败/);
        expect(outcome.fixHint).toBeDefined();
      }
      expect(await exists(fixture.checkoutDir)).toBe(false);
      expect(await exists(blogLockDir(fixture.home, ACCOUNT_ID))).toBe(false);
      expect(await fixture.snapshotAuthor()).toEqual(before);
    } finally {
      await fixture.close();
    }
  }, 120_000);

  it("仓库位置填错了（目录不存在）：失败并说明", async () => {
    await withFixture(async (fixture) => {
      const outcome = await createBlogImporter().list(
        importContext(fixture, {
          setting: (key) =>
            key === "repo-path"
              ? join(fixture.base, "不存在的仓库")
              : fixture.ctx.setting(key),
        }),
      );

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toContain("工作目录不存在");
    });
  }, 120_000);

  it("线上 main 里没有 content/posts：说明是仓库位置配错了", async () => {
    await withFixture(async (fixture) => {
      // 另起一个只有 README 的仓库当「博客」
      const remote = join(fixture.base, "other-remote.git");
      const other = join(fixture.base, "other-repo");
      await fixture.git(
        ["init", "--bare", "--initial-branch=main", remote],
        fixture.base,
      );
      await mkdir(other, { recursive: true });
      await fixture.git(["init", "--initial-branch=main"], other);
      await writeFile(join(other, "README.md"), "不是博客\n", "utf8");
      await fixture.git(["add", "-A"], other);
      await fixture.git(
        [
          "-c",
          "user.name=T",
          "-c",
          "user.email=t@example.invalid",
          "commit",
          "-m",
          "init",
        ],
        other,
      );
      await fixture.git(["remote", "add", "origin", remote], other);
      await fixture.git(["push", "origin", "main"], other);

      const outcome = await createBlogImporter().list(
        importContext(fixture, {
          setting: (key) =>
            key === "repo-path" ? other : fixture.ctx.setting(key),
        }),
      );

      expect(outcome).toMatchObject({
        ok: false,
        reason:
          "博客仓库的线上 main 里没有 content/posts 文件夹，确认博客仓库位置配对了",
      });
    });
  }, 120_000);
});
