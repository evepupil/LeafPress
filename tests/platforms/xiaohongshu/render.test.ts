import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createRenderStep } from "../../../src/platforms/xiaohongshu/steps/render.js";

import {
  GOOD_COPY,
  GOOD_DECK,
  makeFakeRenderer,
  makeXhsFixture,
} from "./fixtures.js";

async function listCards(folder: string): Promise<string[]> {
  const files = await readdir(join(folder, "卡片"), { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

describe("排版步骤 render：检查失败", () => {
  it("两份稿子的问题一次全列出来", async () => {
    const fixture = await makeXhsFixture();
    const render = createRenderStep(makeFakeRenderer().renderer);
    try {
      // 卡片稿只有 1 页（页数不对）且封面超字；文案只有 2 个标签
      await fixture.writeFile(
        "卡片.md",
        "# " + "超".repeat(19) + "\n副标题\n\n---\n\n## 要点\n- 一条",
      );
      await fixture.writeFile("文案.md", "# 标题\n正文\n#只有一个 #两个");
      const outcome = await render(fixture.ctx);
      expect(outcome).toEqual({
        kind: "fail",
        error: [
          "卡片.md：页数不对：现在 2 页，要 3～18 页（封面 1 张 + 要点页 + 总结 1 张）",
          `卡片.md：封面这句 19 字，超过 18 字：「${"超".repeat(19)}」`,
          "卡片.md：缺总结：最后一页的标题要以「总结」开头，现在是「要点」",
          "文案.md：话题标签 2 个，要 3～8 个",
        ].join("\n"),
      });
    } finally {
      await fixture.close();
    }
  });

  it("缺稿子：说清楚缺哪个文件", async () => {
    const fixture = await makeXhsFixture();
    const render = createRenderStep(makeFakeRenderer().renderer);
    try {
      await fixture.writeFile("卡片.md", GOOD_DECK);
      const outcome = await render(fixture.ctx);
      expect(outcome).toEqual({
        kind: "fail",
        error: "任务文件夹里没有 文案.md，先让上一步把稿子写出来",
      });
    } finally {
      await fixture.close();
    }
  });
});

describe("排版步骤 render：出图和预览页", () => {
  it("出了 N 张卡片，预览页里有图和文案，心跳递给出图器", async () => {
    const fixture = await makeXhsFixture();
    const fake = makeFakeRenderer();
    const render = createRenderStep(fake.renderer);
    let heartbeats = 0;
    fixture.ctx.heartbeat = () => {
      heartbeats += 1;
    };
    try {
      await fixture.writeFile("卡片.md", GOOD_DECK);
      await fixture.writeFile("文案.md", GOOD_COPY);
      const outcome = await render(fixture.ctx);
      expect(outcome).toEqual({ kind: "done", note: "出了 3 张卡片" });

      // 出图目录里有 3 张图，出图器拿到的是解析后的卡片组
      expect(await listCards(fixture.folder)).toEqual([
        "01.png",
        "02.png",
        "03.png",
      ]);
      expect(fake.calls).toEqual([
        { pages: 3, outDir: join(fixture.folder, "卡片"), heartbeats: 3 },
      ]);
      expect(heartbeats).toBe(3);

      const html = await readFile(
        join(fixture.folder, "小红书发布稿.html"),
        "utf8",
      );
      // 3 张图按页序内嵌成 data URL
      expect(html.match(/<img src="data:image\/png;base64,/g)).toHaveLength(3);
      // 文案在页面上（标签行也带出来）
      expect(html).toContain("<h1>标题不超二十个字</h1>");
      expect(html).toContain("<p>正文一行。</p>");
      expect(html).toContain("#标签一 #标签二 #标签三");
      expect(html).toContain("复制文案");
    } finally {
      await fixture.close();
    }
  });

  it("重复执行先清掉旧图", async () => {
    const fixture = await makeXhsFixture();
    const render = createRenderStep(makeFakeRenderer().renderer);
    try {
      await fixture.writeFile("卡片.md", GOOD_DECK);
      await fixture.writeFile("文案.md", GOOD_COPY);
      await render(fixture.ctx);

      // 塞一张上一版多出来的图：重跑后必须不在了
      await fixture.writeFile("卡片/99.png", Buffer.from([0x89, 0x50]));
      await render(fixture.ctx);
      expect(await listCards(fixture.folder)).toEqual([
        "01.png",
        "02.png",
        "03.png",
      ]);
    } finally {
      await fixture.close();
    }
  });

  it("出图器抛错：转成失败，不写预览页", async () => {
    const fixture = await makeXhsFixture();
    const fake = makeFakeRenderer();
    fake.failWith("找不到 Edge：卡片出图要用本机的 Edge 浏览器");
    const render = createRenderStep(fake.renderer);
    try {
      await fixture.writeFile("卡片.md", GOOD_DECK);
      await fixture.writeFile("文案.md", GOOD_COPY);
      const outcome = await render(fixture.ctx);
      expect(outcome).toEqual({
        kind: "fail",
        error: "找不到 Edge：卡片出图要用本机的 Edge 浏览器",
      });
      await expect(
        readFile(join(fixture.folder, "小红书发布稿.html"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fixture.close();
    }
  });
});
