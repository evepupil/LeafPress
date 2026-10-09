/**
 * 译文配对键（translationKey）撞车的提示。
 * 配对键写在中英两篇稿子的 frontmatter 里，只改 slug.txt 解决不了；
 * 原来的提示一律说「改 slug.txt 里的 slug 再跑」，agent 会照着错误提示一直改。
 * 同名文件、图片目录撞车的提示不变，见 gate.test.ts。
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collisionMessage,
  gateBlogDraft,
} from "../../../src/platforms/blog/steps/gate.js";
import { draftText, exists, makeBlogFixture } from "./steps-fixtures.js";

describe("collisionMessage：撞车时给作者的提示", () => {
  it("同名文件、图片文件夹：改 slug 就能解决，提示保持原样", () => {
    expect(
      collisionMessage({ kind: "path", path: "content/posts/zh/a.mdx" }),
    ).toBe(
      "slug 撞了已有文章：content/posts/zh/a.mdx，改 slug.txt 里的 slug 再跑",
    );
    expect(
      collisionMessage({ kind: "path", path: "public/images/posts/a/" }),
    ).toBe(
      "slug 撞了已有文章：public/images/posts/a/，改 slug.txt 里的 slug 再跑",
    );
  });

  it("配对键撞了：说出键和撞上的文章，教人换 slug 的同时改两篇稿子里的 translationKey", () => {
    const message = collisionMessage({
      kind: "translationKey",
      key: "my-key",
      path: "content/posts/en/other.mdx",
    });

    expect(message).toBe(
      "译文配对键 my-key 和已有文章 content/posts/en/other.mdx 撞了：换一个 slug 写进 slug.txt，同时把中英两篇稿子 frontmatter 里的 translationKey 改成新的 slug，再跑",
    );
    // 不会再让人只改 slug.txt
    expect(message).not.toContain("slug 撞了已有文章");
  });
});

describe("博客 gate 步骤：译文配对键撞了已有文章", () => {
  it("线上已有文章用了同一个配对键：失败并给出配对键专用的提示，不写 .gate.json", async () => {
    const fixture = await makeBlogFixture();
    try {
      await fixture.pushFromElsewhere(
        {
          "content/posts/zh/another-slug.mdx": draftText({
            title: "别的文章",
            locale: "zh-CN",
            translationKey: "test-article",
          }),
        },
        "线上已有",
      );

      const outcome = await gateBlogDraft(fixture.ctx);

      expect(outcome).toEqual({
        kind: "fail",
        error:
          "译文配对键 test-article 和已有文章 content/posts/zh/another-slug.mdx 撞了：换一个 slug 写进 slug.txt，同时把中英两篇稿子 frontmatter 里的 translationKey 改成新的 slug，再跑",
      });
      expect(fixture.pnpm.calls.map((call) => call.script)).toEqual([
        "install",
      ]);
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
      expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
