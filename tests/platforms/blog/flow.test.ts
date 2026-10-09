import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createBlogArchiveHandler } from "../../../src/platforms/blog/steps/archive.js";
import { gateBlogDraft } from "../../../src/platforms/blog/steps/gate.js";
import { publishBlogDraft } from "../../../src/platforms/blog/steps/publish.js";
import {
  SLUG,
  draftText,
  formatted,
  makeBlogFixture,
  readTaskFile,
} from "./steps-fixtures.js";

describe("博客三个步骤连起来走一遍：检查 → 推送 → 等上线归档", () => {
  it("推上线的是检查时排好版的稿子；全程作者工作区一个字节不动", async () => {
    const fixture = await makeBlogFixture({ withImages: true });
    try {
      const before = await fixture.snapshotAuthor();

      const gate = await gateBlogDraft(fixture.ctx);
      expect(gate).toEqual({ kind: "done", note: "博客检查全过" });

      const publish = await publishBlogDraft(fixture.ctx);
      expect(publish.kind).toBe("done");
      const head = await fixture.remoteHead();
      expect(
        await fixture.git(
          [
            "--git-dir",
            fixture.remote,
            "show",
            `${head}:content/posts/zh/${SLUG}.mdx`,
          ],
          fixture.base,
        ),
      ).toBe(
        formatted(draftText({ title: "测试文章", locale: "zh-CN" })).trim(),
      );

      let attempts = 0;
      const archive = await createBlogArchiveHandler({
        fetch: () => {
          attempts += 1;
          return Promise.resolve(
            new Response(null, { status: attempts < 3 ? 404 : 200 }),
          );
        },
        sleep: () => Promise.resolve(),
      })(fixture.ctx);
      expect(archive).toEqual({
        kind: "done",
        url: `https://blog.example.test/posts/${SLUG}/`,
        publishedAt: "2026-10-08",
        localPath: join(fixture.repo, "content", "posts", "zh", `${SLUG}.mdx`),
        sourceRef: `zh/${SLUG}`,
        note: "已上线",
      });

      expect(await fixture.snapshotAuthor()).toEqual(before);
    } finally {
      await fixture.close();
    }
  }, 120_000);

  it("检查之后又改了稿子：推送拒绝，重新检查后才能推", async () => {
    const fixture = await makeBlogFixture();
    try {
      expect((await gateBlogDraft(fixture.ctx)).kind).toBe("done");
      const headBefore = await fixture.remoteHead();
      await writeFile(
        join(fixture.folder, "中文稿.mdx"),
        draftText({ title: "检查之后改的标题", locale: "zh-CN" }),
        "utf8",
      );

      const refused = await publishBlogDraft(fixture.ctx);
      expect(refused).toEqual({
        kind: "fail",
        error:
          "稿子在检查之后改过：先运行 leafpress work back b-1 4 重新跑检查",
      });
      expect(await fixture.remoteHead()).toBe(headBefore);

      expect((await gateBlogDraft(fixture.ctx)).kind).toBe("done");
      expect((await publishBlogDraft(fixture.ctx)).kind).toBe("done");
      expect(await readTaskFile(fixture, "中文稿.mdx")).toContain(
        "检查之后改的标题",
      );
      expect(
        await fixture.git(
          ["--git-dir", fixture.remote, "log", "-1", "--format=%s"],
          fixture.base,
        ),
      ).toBe("post: 检查之后改的标题");
    } finally {
      await fixture.close();
    }
  }, 120_000);
});
