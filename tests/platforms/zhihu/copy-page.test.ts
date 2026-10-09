import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { generateCopyPage } from "../../../src/platforms/zhihu/steps/copy-page.js";

import {
  makeSourceRepo,
  makeZhihuFixture,
  toSourceWork,
  type ZhihuFixture,
} from "./fixtures.js";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;

async function withFixture(
  options: Parameters<typeof makeZhihuFixture>[0],
  run: (fixture: ZhihuFixture) => Promise<void>,
): Promise<void> {
  const fixture = await makeZhihuFixture(options);
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

async function readPage(folder: string): Promise<string> {
  return readFile(join(folder, "知乎发布稿.html"), "utf8");
}

/** 正文部分：剥掉模板的样式和脚本，只看转换结果 */
function bodyHtml(page: string): string {
  const start = page.indexOf('<div id="zhihu-body">');
  const end = page.indexOf("</div>\n</div>", start);
  return page.slice(start, end);
}

describe("知乎 copy-page：标题处理", () => {
  it("文章：第一行 # 标题 变成 <h1>，正文里不再出现", async () => {
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      await fixture.writeFile(
        "文章.md",
        "# 我的标题\n\n第一段。\n\n## 小节\n\n第二段。\n",
      );

      const outcome = await generateCopyPage(fixture.ctx);

      expect(outcome).toEqual({
        kind: "done",
        note: "复制页已生成：0 张图",
      });
      const page = await readPage(fixture.folder);
      expect(page).toContain("<title>我的标题</title>");
      expect(bodyHtml(page)).toContain("<h1>我的标题</h1>");
      expect(bodyHtml(page)).not.toMatch(/#\s+我的标题/);
    });
  });

  it("文章带 frontmatter：先去掉再取标题", async () => {
    await withFixture({ workflowId: "zhihu-from-blog" }, async (fixture) => {
      await fixture.writeFile(
        "文章.md",
        '---\ntitle: "frontmatter 标题"\n---\n\n# 正文标题\n\n内容。\n',
      );

      await generateCopyPage(fixture.ctx);

      const page = await readPage(fixture.folder);
      expect(page).toContain("<title>正文标题</title>");
      expect(page).not.toContain("frontmatter 标题");
    });
  });

  it("回答：没有标题，正文直接开始，也不加原文链接", async () => {
    await withFixture({ workflowId: "zhihu-answer" }, async (fixture) => {
      await fixture.writeFile("回答.md", "回答的第一段。\n\n第二段。\n");

      const outcome = await generateCopyPage(fixture.ctx);

      expect(outcome).toEqual({
        kind: "done",
        note: "复制页已生成：0 张图",
      });
      const page = await readPage(fixture.folder);
      expect(page).not.toContain("<h1>");
      expect(bodyHtml(page)).toContain("<p>回答的第一段。</p>");
      expect(page).not.toContain("原文：");
    });
  });
});

describe("知乎 copy-page：链接", () => {
  it("以 / 开头的站内链接补成来源博客的完整网址；外链不动；没有来源就不动", async () => {
    const sourceWork = { url: "https://blog.example.test/posts/old/" };
    await withFixture(
      { workflowId: "zhihu-from-blog", sourceWork },
      async (fixture) => {
        await fixture.writeFile(
          "文章.md",
          [
            "# 标题",
            "",
            "看[旧文](/posts/old/)和[更旧](/posts/older/)。",
            "",
            "[外链](https://other.example/x)和[锚点](#section)不动。",
            "",
          ].join("\n"),
        );

        await generateCopyPage(fixture.ctx);

        const page = await readPage(fixture.folder);
        const body = bodyHtml(page);
        expect(body).toContain(
          '<a href="https://blog.example.test/posts/old/">旧文</a>',
        );
        expect(body).toContain(
          '<a href="https://blog.example.test/posts/older/">更旧</a>',
        );
        expect(body).toContain('<a href="https://other.example/x">外链</a>');
        expect(body).toContain('<a href="#section">锚点</a>');
      },
    );

    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      await fixture.writeFile(
        "文章.md",
        "# 标题\n\n[站内](/posts/x/)没有来源，不补。\n",
      );
      await generateCopyPage(fixture.ctx);
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain('<a href="/posts/x/">站内</a>');
    });
  });

  it("站内链接补全不动代码：代码块和行内代码里的 [x](/path) 原样保留", async () => {
    await withFixture(
      {
        workflowId: "zhihu-from-blog",
        sourceWork: { url: "https://blog.example.test/posts/old/" },
      },
      async (fixture) => {
        await fixture.writeFile(
          "文章.md",
          [
            "# 标题",
            "",
            "正文里的[真链接](/posts/x/)要补。",
            "",
            "```js",
            "// 代码里的 [文档](/docs/api/) 不动",
            'const url = "[链接](/a)";',
            "```",
            "",
            "行内代码 `[x](/path)` 里的也不动。",
            "",
          ].join("\n"),
        );

        await generateCopyPage(fixture.ctx);

        const body = bodyHtml(await readPage(fixture.folder));
        // 正文里的补全
        expect(body).toContain(
          '<a href="https://blog.example.test/posts/x/">真链接</a>',
        );
        // 代码块里的原样保留（引号会被转义，这是正常的）
        expect(body).toContain("const url = &quot;[链接](/a)&quot;;");
        // 行内代码里的原样保留
        expect(body).toContain("<code>[x](/path)</code>");
        // 代码块里的地址没有被替换成补全后的
        expect(body).not.toContain(
          '<a href="https://blog.example.test/docs/api/"',
        );
      },
    );
  });

  it("列表、引用、表格里的站内链接也都补全", async () => {
    await withFixture(
      {
        workflowId: "zhihu-from-blog",
        sourceWork: { url: "https://blog.example.test/posts/old/" },
      },
      async (fixture) => {
        await fixture.writeFile(
          "文章.md",
          [
            "# 标题",
            "",
            "- 列表里[甲](/a)",
            "",
            "> 引用里[乙](/b)",
            "",
            "| 列 | 值 |",
            "| --- | --- |",
            "| [丙](/c) | 1 |",
            "",
          ].join("\n"),
        );

        await generateCopyPage(fixture.ctx);

        const body = bodyHtml(await readPage(fixture.folder));
        expect(body).toContain('<a href="https://blog.example.test/a">甲</a>');
        expect(body).toContain('<a href="https://blog.example.test/b">乙</a>');
        // 表格单元格里的也补全（生成的 href 里 & 会被转义，这里路径没有 &）
        expect(body).toContain('<a href="https://blog.example.test/c">丙</a>');
      },
    );
  });

  it("有来源作品时文末加「原文：<链接>」，作者自己写过的不再加", async () => {
    const sourceWork = { url: "https://blog.example.test/posts/old/" };
    await withFixture(
      { workflowId: "zhihu-from-blog", sourceWork },
      async (fixture) => {
        await fixture.writeFile("文章.md", "# 标题\n\n正文。\n");
        await generateCopyPage(fixture.ctx);
        const body = bodyHtml(await readPage(fixture.folder));
        expect(body).toContain(
          '<p>原文：<a href="https://blog.example.test/posts/old/">https://blog.example.test/posts/old/</a></p>',
        );
      },
    );

    await withFixture(
      { workflowId: "zhihu-from-blog", sourceWork },
      async (fixture) => {
        await fixture.writeFile(
          "文章.md",
          "# 标题\n\n正文。\n\n原文：https://blog.example.test/posts/old/\n",
        );
        await generateCopyPage(fixture.ctx);
        const body = bodyHtml(await readPage(fixture.folder));
        expect((body.match(/原文：/g) ?? []).length, "自己写了就不重复加").toBe(
          1,
        );
      },
    );
  });
});

describe("知乎 copy-page：图片内嵌", () => {
  it("三种来源依次生效：任务文件夹、来源仓库 public/、站点下载", async () => {
    // 任务文件夹里的同名文件优先
    await withFixture(
      {
        workflowId: "zhihu-from-blog",
        sourceWork: {
          url: "https://blog.example.test/posts/old/",
          localPath: join("unused"),
        },
      },
      async (fixture) => {
        await fixture.writeFile(
          "文章.md",
          "# 标题\n\n![图注](/images/a.png)\n",
        );
        await fixture.writeFile("a.png", PNG_BYTES);

        const outcome = await generateCopyPage(fixture.ctx);

        expect(outcome).toEqual({ kind: "done", note: "复制页已生成：1 张图" });
        const body = bodyHtml(await readPage(fixture.folder));
        expect(body).toContain(`src="${PNG_DATA_URL}"`);
        expect(body).toContain('data-title="图注"');
        expect(body).not.toContain("/images/a.png");
      },
    );

    // 来源博客仓库 public/ 下的对应路径
    await withFixture({ workflowId: "zhihu-from-blog" }, async (fixture) => {
      const source = await makeSourceRepo(fixture, {
        "public/images/b.png": PNG_BYTES,
      });
      await fixture.writeFile("文章.md", "# 标题\n\n![说明](/images/b.png)\n");
      const ctx = { ...fixture.ctx, sourceWork: toSourceWork(source) };

      const outcome = await generateCopyPage(ctx);

      expect(outcome).toEqual({ kind: "done", note: "复制页已生成：1 张图" });
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain(`src="${PNG_DATA_URL}"`);
    });

    // 从站点下载
    await withFixture({ workflowId: "zhihu-from-blog" }, async (fixture) => {
      const source = await makeSourceRepo(fixture, {});
      fixture.setResponses({
        "https://blog.example.test/images/c.png": PNG_BYTES,
      });
      await fixture.writeFile("文章.md", "# 标题\n\n![下载](/images/c.png)\n");
      const ctx = { ...fixture.ctx, sourceWork: toSourceWork(source) };

      const outcome = await generateCopyPage(ctx);

      expect(outcome).toEqual({ kind: "done", note: "复制页已生成：1 张图" });
      expect(fixture.requests).toEqual([
        { url: "https://blog.example.test/images/c.png", hasSignal: true },
      ]);
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain(`src="${PNG_DATA_URL}"`);
    });
  });

  it("都拿不到：换成占位行，note 写清哪几张", async () => {
    await withFixture({ workflowId: "zhihu-from-blog" }, async (fixture) => {
      const source = await makeSourceRepo(fixture, {});
      await fixture.writeFile(
        "文章.md",
        "# 标题\n\n![没了](/images/gone.png)\n\n![也没了](/images/also-gone.png)\n",
      );
      const ctx = { ...fixture.ctx, sourceWork: toSourceWork(source) };

      const outcome = await generateCopyPage(ctx);

      expect(outcome).toEqual({
        kind: "done",
        note: "复制页已生成：0 张图；缺 2 张：/images/gone.png、/images/also-gone.png",
      });
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain("<p>【图片缺失：/images/gone.png】</p>");
      expect(body).toContain("<p>【图片缺失：/images/also-gone.png】</p>");
      expect(body).not.toContain("<figure");
    });
  });

  it("外链图片（https://…）下载后内嵌，下载不到才当缺图", async () => {
    // 能下载的内嵌
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      fixture.setResponses({
        "https://cdn.example.net/pic/remote.png": PNG_BYTES,
      });
      await fixture.writeFile(
        "文章.md",
        "# 标题\n\n![外链图](https://cdn.example.net/pic/remote.png)\n",
      );

      const outcome = await generateCopyPage(fixture.ctx);

      expect(outcome).toEqual({ kind: "done", note: "复制页已生成：1 张图" });
      expect(fixture.requests).toEqual([
        {
          url: "https://cdn.example.net/pic/remote.png",
          hasSignal: true,
        },
      ]);
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain(`src="${PNG_DATA_URL}"`);
    });

    // 下载不到的当缺图，note 里写原地址
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      await fixture.writeFile(
        "文章.md",
        "# 标题\n\n![挂了](https://cdn.example.net/pic/dead.png)\n",
      );

      const outcome = await generateCopyPage(fixture.ctx);

      expect(outcome).toEqual({
        kind: "done",
        note: "复制页已生成：0 张图；缺 1 张：https://cdn.example.net/pic/dead.png",
      });
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain(
        "<p>【图片缺失：https://cdn.example.net/pic/dead.png】</p>",
      );
    });
  });

  it("引用式图片（![图][id] + [id]: 地址）也认：站内补全、外链下载都生效", async () => {
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      fixture.setResponses({
        "https://cdn.example.net/pic/ref-remote.png": PNG_BYTES,
      });
      await fixture.writeFile(
        "文章.md",
        [
          "# 标题",
          "",
          "![第一张][logo]",
          "",
          "![第二张][remote]",
          "",
          "[logo]: /images/ref.png",
          "[remote]: https://cdn.example.net/pic/ref-remote.png",
          "",
        ].join("\n"),
      );

      const outcome = await generateCopyPage(fixture.ctx);

      expect(outcome).toEqual({
        kind: "done",
        note: "复制页已生成：1 张图；缺 1 张：/images/ref.png",
      });
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain(`src="${PNG_DATA_URL}"`);
      expect(body).toContain("<p>【图片缺失：/images/ref.png】</p>");
    });
  });

  it("编码过的 ../ 路径穿越：一律当缺图，不读任务文件夹和仓库外的文件", async () => {
    // 仓库 public/ 下有一个真文件，稿件里用 .. 逃出 public/ 指向仓库根的敏感文件
    await withFixture({ workflowId: "zhihu-from-blog" }, async (fixture) => {
      const source = await makeSourceRepo(fixture, {
        "secret.txt": new TextEncoder().encode("别看这个"),
      });
      await fixture.writeFile(
        "文章.md",
        "# 标题\n\n![逃逸](/..%2Fsecret.txt)\n",
      );
      const ctx = { ...fixture.ctx, sourceWork: toSourceWork(source) };

      const outcome = await generateCopyPage(ctx);

      expect(outcome).toEqual({
        kind: "done",
        note: "复制页已生成：0 张图；缺 1 张：/..%2Fsecret.txt",
      });
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain("<p>【图片缺失：/..%2Fsecret.txt】</p>");
      // 也没去站点下载这个地址（前面两级都没中，才轮到下载，但下载拿不到 secret 内容也不会内嵌）
    });

    // 任务文件夹同级有一个真文件，稿件里用 .. 指过去
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      await writeFile(
        join(dirname(fixture.folder), "escape.png"),
        Buffer.from(PNG_BYTES),
      );
      await fixture.writeFile(
        "文章.md",
        "# 标题\n\n![逃逸](/..%2Fescape.png)\n",
      );

      const outcome = await generateCopyPage(fixture.ctx);

      expect(outcome.kind).toBe("done");
      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).toContain("【图片缺失：/..%2Fescape.png】");
      expect(body).not.toContain(PNG_DATA_URL);
    });
  });
});

describe("知乎 copy-page：mermaid 和转换质量", () => {
  it("mermaid 代码块包成 figure，data-title 取图前最近一行文字", async () => {
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      await fixture.writeFile(
        "文章.md",
        [
          "# 标题",
          "",
          "三者的分工：",
          "",
          "```mermaid",
          "flowchart TD",
          "  A-->B",
          "```",
          "",
          "第二张没有前文。",
          "",
          "```mermaid",
          "flowchart LR",
          "  C-->D",
          "```",
          "",
        ].join("\n"),
      );

      const outcome = await generateCopyPage(fixture.ctx);

      expect(outcome).toEqual({
        kind: "done",
        note: "复制页已生成：2 张图",
      });
      const body = bodyHtml(await readPage(fixture.folder));
      const figures = body.match(/<figure class="fig"[^>]*>/g) ?? [];
      expect(figures).toEqual([
        '<figure class="fig" data-title="三者的分工：">',
        '<figure class="fig" data-title="第二张没有前文。">',
      ]);
      expect(body).toContain(
        '<pre class="mermaid">flowchart TD\n  A--&gt;B</pre>',
      );
    });
  });

  it("正文里没有残留的 ##、**；表格、列表、代码都转成真标签", async () => {
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      await fixture.writeFile(
        "文章.md",
        [
          "# 标题",
          "",
          "**加粗**和`代码`。",
          "",
          "## 二级标题",
          "",
          "- 甲",
          "- 乙",
          "",
          "| A | B |",
          "| --- | --- |",
          "| 1 | 2 |",
          "",
          "```js",
          "const x = 1;",
          "```",
          "",
        ].join("\n"),
      );

      await generateCopyPage(fixture.ctx);

      const body = bodyHtml(await readPage(fixture.folder));
      expect(body).not.toMatch(/\*\*/);
      expect(body).not.toMatch(/^##\s/m);
      expect(body).toContain("<strong>加粗</strong>");
      expect(body).toContain("<code>代码</code>");
      expect(body).toContain("<h2>二级标题</h2>");
      expect(body).toContain("<ul>");
      expect(body).toContain("<li>甲</li>");
      expect(body).toContain("<table>");
      expect(body).toContain('<code class="language-js">');
    });
  });

  it("重复执行结果一样（可以覆盖重跑）", async () => {
    await withFixture(
      {
        workflowId: "zhihu-from-blog",
        sourceWork: { url: "https://blog.example.test/posts/old/" },
      },
      async (fixture) => {
        await fixture.writeFile(
          "文章.md",
          "# 标题\n\n![图注](/images/x.png)\n\n看[旧文](/posts/old/)。\n\n```mermaid\nA-->B\n```\n",
        );
        fixture.setResponses({
          "https://blog.example.test/images/x.png": PNG_BYTES,
        });

        const first = await generateCopyPage(fixture.ctx);
        const firstPage = await readPage(fixture.folder);
        const second = await generateCopyPage(fixture.ctx);
        const secondPage = await readPage(fixture.folder);

        expect(second).toEqual(first);
        expect(secondPage).toBe(firstPage);
      },
    );
  });

  it("任务文件夹里没有稿子：失败并说明", async () => {
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      const outcome = await generateCopyPage(fixture.ctx);
      expect(outcome).toEqual({
        kind: "fail",
        error: "任务文件夹里没有 文章.md，先让上一步把稿子写出来",
      });
    });
  });

  it("稿子里的原始 HTML 一律转义成文字：生成页里没有可执行的 script", async () => {
    await withFixture({ workflowId: "zhihu-article" }, async (fixture) => {
      await fixture.writeFile(
        "文章.md",
        [
          "# 标题",
          "",
          "<script>alert(1)</script>",
          "",
          "行内<img src=x onerror=alert(1)>标签",
          "",
          '<iframe src="https://evil.example"></iframe>',
          "",
        ].join("\n"),
      );

      await generateCopyPage(fixture.ctx);

      const page = await readPage(fixture.folder);
      // 正文部分：三段都转成文字，没有活的标签
      const body = bodyHtml(page);
      expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;标签");
      expect(body).toContain("&lt;iframe src=");
      // 整页里除了模板自己的 mermaid 和内联脚本，没有别的 script 标签
      const scripts = [...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      expect(scripts, "页面上只剩模板自己的脚本").toEqual([
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js">',
        "<script>",
      ]);
      // onerror 也没有作为活的属性留下来（转义后只剩文字，没有 < 开头的新标签）
      expect(body).not.toMatch(/<[^>]*\bonerror\s*=/);
      expect(body).not.toMatch(/<script/i);
    });
  });
});
