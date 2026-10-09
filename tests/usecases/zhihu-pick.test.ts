import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CodeStepHandler } from "../../src/platforms/types.js";
import { addAccount, blogSettings, withUseCases } from "./helpers.js";

const QUESTION_BRIEF =
  "回答这个问题 https://www.zhihu.com/question/123456 说清楚前后经过";

describe("知乎工作流的自动配和代码步骤的来源作品", () => {
  it("带问题链接的灵感转知乎作品配到回答问题；没有问题链接配到写文章", async () => {
    await withUseCases(({ usecases }) => {
      const zhihu = addAccount(usecases, "知乎号", "zhihu");
      const [idea] = usecases.addIdeas([
        { text: "问题灵感", detail: "", source: "quick" },
      ]);
      if (!idea) throw new Error("没有创建灵感");
      const [withQuestion] = usecases.createWorks({
        source: { kind: "idea", ideaId: idea.id },
        accountIds: [zhihu.id],
        brief: QUESTION_BRIEF,
      });
      expect(withQuestion?.workflowId).toBe("zhihu-answer");

      const [plain] = usecases.createWorks({
        source: { kind: "new", title: "直接新写的文章" },
        accountIds: [zhihu.id],
        brief: "没有链接的要求",
      });
      expect(plain?.workflowId).toBe("zhihu-article");

      // 直接新建但要求里贴了问题链接，同样配到回答问题
      const [newWithQuestion] = usecases.createWorks({
        source: { kind: "new", title: "另一个问题" },
        accountIds: [zhihu.id],
        brief: QUESTION_BRIEF,
      });
      expect(newWithQuestion?.workflowId).toBe("zhihu-answer");
    });
  });

  it("博客作品转知乎作品配到博客改写", async () => {
    await withUseCases(({ usecases, home }) => {
      const blog = addAccount(usecases, "博客号", "blog", blogSettings(home));
      const zhihu = addAccount(usecases, "知乎号", "zhihu");
      const source = usecases.createWorks({
        source: { kind: "new", title: "要改写的博客文章" },
        accountIds: [blog.id],
        brief: "博客原稿",
      })[0];
      if (!source) throw new Error("没有创建来源作品");

      const [converted] = usecases.createWorks({
        source: { kind: "work", workId: source.id },
        accountIds: [zhihu.id],
        brief: "照知乎的写法改写",
      });
      expect(converted).toMatchObject({
        workflowId: "zhihu-from-blog",
        source: { kind: "work", workId: source.id },
      });
    });
  });

  it("博客改写的代码步骤拿到的 sourceWork 是来源那篇", async () => {
    let seen: { workId: string; sourceWorkId: string | undefined }[] = [];
    const handler: CodeStepHandler = (ctx) => {
      seen.push({
        workId: ctx.work.id,
        sourceWorkId: ctx.sourceWork?.id,
      });
      return Promise.resolve({ kind: "done" });
    };
    await withUseCases(
      async ({ usecases, home }) => {
        const blog = addAccount(usecases, "博客号", "blog", blogSettings(home));
        const zhihu = addAccount(usecases, "知乎号", "zhihu");
        const source = usecases.createWorks({
          source: { kind: "new", title: "来源博客文章" },
          accountIds: [blog.id],
          brief: "博客原稿",
        })[0];
        if (!source) throw new Error("没有创建来源作品");
        const [converted] = usecases.createWorks({
          source: { kind: "work", workId: source.id },
          accountIds: [zhihu.id],
          brief: "照知乎的写法改写",
        });
        if (!converted) throw new Error("没有创建知乎作品");

        // 第 1 步是 AI 步骤（改写成知乎文章），接手完成它，代码步骤才会轮到
        const started = usecases.startWork({ id: converted.id });
        const token = started.lease?.token ?? "";
        if (!started.lease) throw new Error("改写步骤没有发放令牌");
        await writeFile(
          join(started.detail.folder, "文章.md"),
          "# 改写好的文章\n正文",
          "utf8",
        );
        usecases.stepWork(converted.id, token);
        seen = [];
        await usecases.runWork(converted.id, token);
        expect(seen).toEqual([
          { workId: converted.id, sourceWorkId: source.id },
        ]);
      },
      { codeStep: handler },
    );
  });
});
