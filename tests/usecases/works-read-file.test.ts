import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LeafPressError } from "../../src/shared/errors.js";
import { taskFolderPath } from "../../src/files/task-folder.js";
import { addAccount, createGeneralWork, withUseCases } from "./helpers.js";

function expectCode(action: () => unknown, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(LeafPressError);
  expect(caught).toMatchObject({ code });
}

describe("业务用例：读任务文件夹里的文件", () => {
  it("名单内的文件能读出内容和对应的类型", async () => {
    await withUseCases(async ({ usecases, app }) => {
      const account = addAccount(usecases);
      const work = createGeneralWork(usecases, account.id, "复制页作品");
      const folder = taskFolderPath(app.paths, work.id);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "知乎发布稿.html"), "<p>复制页</p>", "utf8");
      await writeFile(join(folder, "稿子.md"), "# 标题", "utf8");
      await writeFile(join(folder, "说明.txt"), "文字", "utf8");
      await writeFile(join(folder, "图.png"), Buffer.from([0x89, 0x50]));

      expect(usecases.showWork(work.id).files).toContain("知乎发布稿.html");
      const page = usecases.readWorkFile(work.id, "知乎发布稿.html");
      expect(page.contentType).toBe("text/html; charset=utf-8");
      expect(page.body.toString("utf8")).toBe("<p>复制页</p>");
      const draft = usecases.readWorkFile(work.id, "稿子.md");
      expect(draft.contentType).toBe("text/plain; charset=utf-8");
      expect(draft.body.toString("utf8")).toBe("# 标题");
      expect(usecases.readWorkFile(work.id, "说明.txt").contentType).toBe(
        "text/plain; charset=utf-8",
      );
      const image = usecases.readWorkFile(work.id, "图.png");
      expect(image.contentType).toBe("image/png");
      expect([...image.body]).toEqual([0x89, 0x50]);
    });
  });

  it("名单外的名字和穿越写法都是 NOT_FOUND", async () => {
    await withUseCases(async ({ usecases, app }) => {
      const account = addAccount(usecases);
      const work = createGeneralWork(usecases, account.id, "防穿越作品");
      const folder = taskFolderPath(app.paths, work.id);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "知乎发布稿.html"), "<p>复制页</p>", "utf8");
      // 任务文件夹外面的文件，拼 ../ 也够不到
      await writeFile(
        join(app.paths.home, "config.json"),
        '{"secret":"不该读"}',
        "utf8",
      );

      for (const name of [
        "不存在的文件.html",
        "../config.json",
        "..\\config.json",
        "../works/../config.json",
        "知乎发布稿.html/..",
        "",
        "./知乎发布稿.html",
      ]) {
        expectCode(() => usecases.readWorkFile(work.id, name), "NOT_FOUND");
      }
      // 名单内的仍能读
      expect(
        usecases.readWorkFile(work.id, "知乎发布稿.html").body.length,
      ).toBe(Buffer.byteLength("<p>复制页</p>"));
    });
  });

  it("图片按扩展名给类型，未列出的扩展名按二进制流", async () => {
    await withUseCases(async ({ usecases, app }) => {
      const account = addAccount(usecases);
      const work = createGeneralWork(usecases, account.id, "图片作品");
      const folder = taskFolderPath(app.paths, work.id);
      await mkdir(folder, { recursive: true });
      const cases: [string, string][] = [
        ["a.png", "image/png"],
        ["b.jpg", "image/jpeg"],
        ["c.jpeg", "image/jpeg"],
        ["d.gif", "image/gif"],
        ["e.webp", "image/webp"],
        ["f.svg", "image/svg+xml"],
        ["g.csv", "application/octet-stream"],
        ["无扩展名", "application/octet-stream"],
      ];
      for (const [name] of cases)
        await writeFile(join(folder, name), "x", "utf8");
      for (const [name, type] of cases) {
        expect(usecases.readWorkFile(work.id, name).contentType).toBe(type);
      }
    });
  });

  it("作品不存在时 NOT_FOUND，其他扩展名的类型按二进制流", async () => {
    await withUseCases(async ({ usecases, app }) => {
      expectCode(
        () => usecases.readWorkFile("b-99", "知乎发布稿.html"),
        "NOT_FOUND",
      );

      const account = addAccount(usecases);
      const work = createGeneralWork(usecases, account.id, "附件作品");
      const folder = taskFolderPath(app.paths, work.id);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "表格.csv"), "a,b", "utf8");
      const file = usecases.readWorkFile(work.id, "表格.csv");
      expect(file.contentType).toBe("application/octet-stream");
      expect(file.body.toString("utf8")).toBe("a,b");
    });
  });
});
