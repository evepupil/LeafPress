import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { workflowById, type ImportSummary } from "@leafpress/core";
import { describe, expect, it } from "vitest";
import type { ImportOutcome } from "../../src/platforms/types.js";
import {
  addAccount,
  blogSettings,
  createWork,
  withUseCases,
} from "./helpers.js";
import { candidate, fakeImporter, listed } from "./import-fixtures.js";

const AT = "2026-10-08T09:00:00+08:00";

describe("导入已有文章", () => {
  it("新文章建成已完成的作品：编号接着已有作品往下排，文章信息原样带上", async () => {
    const importer = fakeImporter(() =>
      listed(
        [
          candidate("first", { tags: ["工程", "记录"] }),
          candidate("second", {
            title: "第二篇",
            publishedAt: "2026-10-04",
            tags: [],
          }),
        ],
        {
          drafts: 3,
          issues: [{ path: "/repo/broken.mdx", message: "缺少标题" }],
        },
      ),
    );
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases);
        createWork(usecases, account.id, "已有的待办作品");

        const summary = await usecases.importPosts(account.id);

        expect(summary).toMatchObject({
          added: 2,
          skipped: 0,
          drafts: 3,
          issues: [{ path: "/repo/broken.mdx", message: "缺少标题" }],
        });
        expect(summary.works.map((work) => work.id)).toEqual(["b-2", "b-3"]);
        expect(summary.works[0]).toEqual({
          id: "b-2",
          title: "文章 first",
          accountId: account.id,
          status: "done",
          brief: "",
          source: { kind: "import" },
          workflowId: "blog-write",
          step: workflowById("blog-write")?.steps.length,
          feedbackHistory: [],
          order: 2,
          createdAt: AT,
          updatedAt: AT,
          url: "https://blog.example/posts/first/",
          publishedAt: "2026-10-01",
          localPath: "/repo/content/posts/zh/first.mdx",
          sourceRef: "zh/first",
          tags: ["工程", "记录"],
          log: [{ at: AT, text: "从博客仓库导入" }],
        });
        expect(summary.works[1]).toMatchObject({
          id: "b-3",
          title: "第二篇",
          publishedAt: "2026-10-04",
          sourceRef: "zh/second",
          tags: [],
        });
        // 存进记录库的和返回的一致；已完成的作品不占待办队列
        for (const work of summary.works) {
          expect(usecases.showWork(work.id).work).toEqual(work);
        }
        // 已完成一列按发布日期倒着排
        expect(
          usecases.listWorks({ status: ["done"] }).map((work) => work.id),
        ).toEqual(["b-3", "b-2"]);
        expect(
          usecases.listWorks({ status: ["todo"] }).map((work) => work.id),
        ).toEqual(["b-1"]);
      },
      { importer },
    );
  });

  it("没有新文章时什么也不建，草稿数和问题照样返回", async () => {
    const importer = fakeImporter(() =>
      listed([], {
        drafts: 2,
        issues: [{ path: "/repo/a.mdx", message: "frontmatter 读不了" }],
      }),
    );
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases);
        expect(await usecases.importPosts(account.id)).toEqual({
          added: 0,
          skipped: 0,
          drafts: 2,
          issues: [{ path: "/repo/a.mdx", message: "frontmatter 读不了" }],
          works: [],
        });
        expect(usecases.listWorks()).toEqual([]);
      },
      { importer },
    );
  });

  it("去重：先比原稿编号，再比链接（忽略末尾斜杠），同一批里重复的只留第一篇", async () => {
    let outcome: ImportOutcome = listed([
      candidate("first"),
      candidate("second"),
    ]);
    const importer = fakeImporter(() => outcome);
    await withUseCases(
      async ({ usecases, app }) => {
        const account = addAccount(usecases);
        const first = await usecases.importPosts(account.id);
        expect(first.works.map((work) => work.id)).toEqual(["b-1", "b-2"]);

        // 不是导入来的作品也算「已有」：agent 按博客写稿流程写完归档的作品带着原稿编号和链接
        const written = createWork(usecases, account.id, "自己写的");
        app.store.transaction(() =>
          app.store.works.update({
            ...written,
            status: "done",
            url: "https://blog.example/posts/mine/",
            sourceRef: "zh/mine",
          }),
        );

        outcome = listed(
          [
            candidate("first"),
            candidate("renamed", {
              url: "https://blog.example/posts/second",
            }),
            candidate("mine-again", {
              sourceRef: "zh/mine",
              url: "https://blog.example/posts/other/",
            }),
            candidate("fresh"),
            candidate("fresh", { title: "同一批里的重复" }),
          ],
          { drafts: 1 },
        );
        const second = await usecases.importPosts(account.id);

        expect(second).toMatchObject({ added: 1, skipped: 4, drafts: 1 });
        expect(second.works).toMatchObject([
          { id: "b-4", title: "文章 fresh", sourceRef: "zh/fresh" },
        ]);
        expect(usecases.listWorks()).toHaveLength(4);

        outcome = listed([candidate("first"), candidate("fresh")]);
        expect(await usecases.importPosts(account.id)).toEqual({
          added: 0,
          skipped: 2,
          drafts: 0,
          issues: [],
          works: [],
        });
      },
      { importer },
    );
  });

  it("去重只比同一个账号：另一个博客账号有相同的原稿编号和链接也照样导入", async () => {
    const importer = fakeImporter(() =>
      listed([candidate("first"), candidate("second")]),
    );
    await withUseCases(
      async ({ usecases }) => {
        const mine = addAccount(usecases, "博客甲");
        const other = addAccount(usecases, "博客乙");

        const first = await usecases.importPosts(mine.id);
        const second = await usecases.importPosts(other.id);

        expect(first.works.map((work) => work.id)).toEqual(["b-1", "b-2"]);
        expect(second).toMatchObject({ added: 2, skipped: 0 });
        expect(second.works.map((work) => [work.id, work.accountId])).toEqual([
          ["b-3", other.id],
          ["b-4", other.id],
        ]);
      },
      { importer },
    );
  });

  it("导入工具拿到账号、数据目录、今天的日期和普通配置项的值，拿不到密钥", async () => {
    const importer = fakeImporter(() => listed([]));
    await withUseCases(
      async ({ usecases, home, app }) => {
        const settings = {
          ...blogSettings(home),
          "umami-share": "https://umami.example/share/secret-share-id",
        };
        const account = addAccount(usecases, "博客", "blog", settings);

        await usecases.importPosts(account.id);

        expect(importer.calls).toHaveLength(1);
        const ctx = importer.calls[0];
        expect(ctx?.account.id).toBe(account.id);
        expect(ctx?.today).toBe("2026-10-08");
        expect(ctx?.home).toBe(app.paths.home);
        expect(ctx?.setting("repo-path")).toBe(join(home, "blog-repo"));
        expect(ctx?.setting("site-url")).toBe("https://blog.example");
        expect(ctx?.setting("umami-share")).toBeUndefined();
        expect(ctx?.setting("没有这一项")).toBeUndefined();
      },
      { importer },
    );
  });

  it("提交后写好每个新作品的任务文件夹", async () => {
    const importer = fakeImporter(() =>
      listed([candidate("first"), candidate("second")]),
    );
    await withUseCases(
      async ({ usecases, app }) => {
        const account = addAccount(usecases);
        const summary: ImportSummary = await usecases.importPosts(account.id);

        for (const work of summary.works) {
          const folder = join(app.paths.tasksDir, work.id);
          expect(existsSync(join(folder, "作品.md"))).toBe(true);
          expect(
            JSON.parse(readFileSync(join(folder, "状态.json"), "utf8")),
          ).toMatchObject({
            id: work.id,
            title: work.title,
            status: "done",
            workflowId: "blog-write",
            url: work.url,
          });
          expect(readFileSync(join(folder, "记录.log"), "utf8")).toContain(
            "从博客仓库导入",
          );
        }
      },
      { importer },
    );
  });

  it("一次导入几十篇：编号连续不重复，每篇的任务文件夹都写好", async () => {
    const slugs = Array.from({ length: 40 }, (_, index) => `post-${index + 1}`);
    const importer = fakeImporter(() =>
      listed(slugs.map((slug) => candidate(slug))),
    );
    await withUseCases(
      async ({ usecases, app }) => {
        const account = addAccount(usecases);

        const summary = await usecases.importPosts(account.id);

        expect(summary).toMatchObject({ added: 40, skipped: 0 });
        expect(summary.works.map((work) => work.id)).toEqual(
          slugs.map((_, index) => `b-${index + 1}`),
        );
        expect(usecases.listWorks({ status: ["done"] })).toHaveLength(40);
        for (const work of summary.works) {
          expect(existsSync(join(app.paths.tasksDir, work.id, "作品.md"))).toBe(
            true,
          );
        }
      },
      { importer },
    );
  }, 30_000);
});
