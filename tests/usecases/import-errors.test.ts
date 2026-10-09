import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ImportOutcome } from "../../src/platforms/types.js";
import { LeafPressError } from "../../src/shared/errors.js";
import { addAccount, blogSettings, withUseCases } from "./helpers.js";
import { candidate, fakeImporter, listed } from "./import-fixtures.js";

describe("导入文章的失败和边界", () => {
  it("平台不能导入报 USAGE，账号不存在报 NOT_FOUND，都不会去跑导入工具", async () => {
    const importer = fakeImporter(() => listed([candidate("first")]));
    await withUseCases(
      async ({ usecases }) => {
        const zhihu = addAccount(usecases, "知乎号", "zhihu");
        await expect(usecases.importPosts(zhihu.id)).rejects.toMatchObject({
          code: "USAGE",
          message: "知乎还不能导入",
        });
        await expect(usecases.importPosts("blog-9")).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "没有这个账号：blog-9",
        });
        expect(importer.calls).toHaveLength(0);
        expect(usecases.listWorks()).toEqual([]);
      },
      { importer },
    );
  });

  it("平台能导入却没有登记导入工具，是程序自己的问题，报 INTERNAL", async () => {
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases);
        await expect(usecases.importPosts(account.id)).rejects.toMatchObject({
          code: "INTERNAL",
          message: "博客的导入工具没有登记",
        });
      },
      {
        // 只登记了拿数据的工具，没有导入工具
        dataTool: {
          pull: () =>
            Promise.resolve({
              ok: true,
              result: { account: [], works: [] },
            }),
        },
      },
    );
  });

  it("导入工具报告失败：STATE_CONFLICT，原因和修复建议原样带出，一篇都不建", async () => {
    let outcome: ImportOutcome = {
      ok: false,
      reason: "博客仓库位置还没配",
      fixHint: "在账号详情 · 接入里填",
    };
    const importer = fakeImporter(() => outcome);
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases);
        await expect(usecases.importPosts(account.id)).rejects.toMatchObject({
          code: "STATE_CONFLICT",
          message: "博客仓库位置还没配",
          hint: "在账号详情 · 接入里填",
        });

        outcome = { ok: false, reason: "仓库打不开" };
        const error = await usecases
          .importPosts(account.id)
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(LeafPressError);
        expect(error).toMatchObject({
          code: "STATE_CONFLICT",
          message: "仓库打不开",
          hint: undefined,
        });
        expect(usecases.listWorks()).toEqual([]);
      },
      { importer },
    );
  });

  it("导入工具抛出异常：LeafPressError 保留原因和建议，其他异常说明是内部错误", async () => {
    let failure: Error = new LeafPressError(
      "EXTERNAL_TOOL_MISSING",
      "找不到命令 git",
      { hint: "请确认 git 已安装" },
    );
    const importer = fakeImporter(() => {
      throw failure;
    });
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases);
        await expect(usecases.importPosts(account.id)).rejects.toMatchObject({
          code: "STATE_CONFLICT",
          message: "找不到命令 git",
          hint: "请确认 git 已安装",
        });

        failure = new Error("读文件时断了");
        const error = await usecases
          .importPosts(account.id)
          .catch((caught: unknown) => caught);
        expect(error).toMatchObject({
          code: "STATE_CONFLICT",
          message: "内部错误：读文件时断了",
          hint: undefined,
        });
        expect(usecases.listWorks()).toEqual([]);
      },
      { importer },
    );
  });

  it("失败原因、异常、返回值、记录库和任务文件夹里都没有密钥", async () => {
    const secret = "umami-share-secret-4096";
    let mode: "fail" | "throw" | "ok" = "fail";
    const importer = fakeImporter(() => {
      if (mode === "throw") throw new Error(`请求 ${secret} 超时`);
      if (mode === "fail")
        return {
          ok: false,
          reason: `共享链接 ${secret} 被拒绝`,
          fixHint: `重新生成 ${secret}`,
        };
      return listed(
        [
          candidate("leak", {
            title: `标题带着 ${secret}`,
            localPath: `/repo/${secret}.mdx`,
          }),
        ],
        {
          issues: [
            { path: `/repo/${secret}/bad.mdx`, message: `读不了 ${secret}` },
          ],
        },
      );
    });
    await withUseCases(
      async ({ usecases, app, home }) => {
        const account = addAccount(usecases, "博客", "blog", {
          ...blogSettings(home),
          "umami-share": secret,
        });

        await expect(usecases.importPosts(account.id)).rejects.toMatchObject({
          message: "共享链接 <redacted> 被拒绝",
          hint: "重新生成 <redacted>",
        });
        mode = "throw";
        await expect(usecases.importPosts(account.id)).rejects.toMatchObject({
          message: "内部错误：请求 <redacted> 超时",
        });

        mode = "ok";
        const summary = await usecases.importPosts(account.id);
        const work = summary.works[0];
        expect(work).toMatchObject({
          title: "标题带着 <redacted>",
          localPath: "/repo/<redacted>.mdx",
        });
        expect(summary.issues).toEqual([
          { path: "/repo/<redacted>/bad.mdx", message: "读不了 <redacted>" },
        ]);

        const folder = join(app.paths.tasksDir, work?.id ?? "");
        const everywhere = [
          JSON.stringify(summary),
          JSON.stringify(usecases.listWorks()),
          JSON.stringify(usecases.bootstrap()),
          ...["作品.md", "状态.json", "记录.log"].map((name) =>
            readFileSync(join(folder, name), "utf8"),
          ),
        ].join("\n");
        expect(everywhere).not.toContain(secret);
      },
      { importer },
    );
  });

  it("中途写入失败整次回滚：已写的作品和用掉的编号都不留", async () => {
    const importer = fakeImporter(() =>
      listed([candidate("first"), candidate("second"), candidate("third")]),
    );
    await withUseCases(
      async ({ usecases, app }) => {
        const account = addAccount(usecases);
        const works = app.store.works;
        const insert = works.insert.bind(works);
        let inserts = 0;
        works.insert = (work, lease) => {
          inserts += 1;
          if (inserts === 2) throw new Error("磁盘写满了");
          insert(work, lease);
        };

        await expect(usecases.importPosts(account.id)).rejects.toThrow(
          "磁盘写满了",
        );
        expect(usecases.listWorks()).toEqual([]);
        expect(existsSync(join(app.paths.tasksDir, "b-1"))).toBe(false);

        works.insert = insert;
        const retried = await usecases.importPosts(account.id);
        expect(retried.works.map((work) => work.id)).toEqual([
          "b-1",
          "b-2",
          "b-3",
        ]);
      },
      { importer },
    );
  });

  it("任务文件夹写失败只记警告，导入照样成功", async () => {
    const warnings: string[] = [];
    const importer = fakeImporter(() =>
      listed([candidate("first"), candidate("second")]),
    );
    await withUseCases(
      async ({ usecases, app }) => {
        const account = addAccount(usecases);
        // 在 b-1 的位置先放一个同名文件，它的任务文件夹就建不出来
        writeFileSync(join(app.paths.tasksDir, "b-1"), "占着位置", "utf8");

        const summary = await usecases.importPosts(account.id);

        expect(summary).toMatchObject({ added: 2, skipped: 0 });
        expect(usecases.listWorks()).toHaveLength(2);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("任务文件夹更新失败（b-1）");
        expect(existsSync(join(app.paths.tasksDir, "b-2", "作品.md"))).toBe(
          true,
        );
      },
      { importer, warn: (message) => warnings.push(message) },
    );
  });
});
