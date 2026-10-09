import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hashDraft,
  loadDraft,
  type Draft,
} from "../../../src/platforms/blog/steps/draft.js";
import {
  CollisionError,
  commitPaths,
  compareOnlinePost,
  copyDraftIn,
  copyFormattedBack,
  DraftChangedError,
  findCollision,
  hashCopiedDraft,
  postTargets,
} from "../../../src/platforms/blog/steps/post-files.js";
import { draftText, exists } from "./steps-fixtures.js";

let base = "";
let folder = "";
let checkout = "";

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "leafpress-postfiles-"));
  folder = join(base, "task");
  checkout = join(base, "checkout");
  await mkdir(folder, { recursive: true });
  await mkdir(checkout, { recursive: true });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(root: string, path: string, content: string | Buffer) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function makeDraft(images: string[] = []): Promise<Draft> {
  await put(folder, "slug.txt", "my-post\n");
  await put(
    folder,
    "中文稿.mdx",
    draftText({ title: "标题", locale: "zh-CN", translationKey: "my-post" }),
  );
  await put(
    folder,
    "英文稿.mdx",
    draftText({ title: "Title", locale: "en", translationKey: "my-post" }),
  );
  for (const image of images) await put(folder, `images/${image}`, image);
  return loadDraft(folder);
}

describe("postTargets 和 commitPaths", () => {
  it("目标路径都在检出目录里", () => {
    expect(postTargets("my-post")).toEqual({
      chinese: "content/posts/zh/my-post.mdx",
      english: "content/posts/en/my-post.mdx",
      imagesDir: "public/images/posts/my-post",
    });
  });

  it("有图片才提交图片文件夹（不存在的路径 git add 会报错）", async () => {
    expect(commitPaths(await makeDraft())).toEqual([
      "content/posts/zh/my-post.mdx",
      "content/posts/en/my-post.mdx",
    ]);
    expect(commitPaths(await makeDraft(["a.png"]))).toEqual([
      "content/posts/zh/my-post.mdx",
      "content/posts/en/my-post.mdx",
      "public/images/posts/my-post",
    ]);
  });
});

describe("findCollision：撞车检查", () => {
  it("什么都没撞：返回 undefined", async () => {
    await put(
      checkout,
      "content/posts/zh/other.mdx",
      draftText({
        title: "别的",
        locale: "zh-CN",
        translationKey: "other",
      }),
    );
    expect(await findCollision(checkout, await makeDraft())).toBeUndefined();
  });

  it("目录都不存在也不报错", async () => {
    expect(await findCollision(checkout, await makeDraft())).toBeUndefined();
  });

  it.each([
    ["中文目录同名 .mdx", "content/posts/zh/my-post.mdx"],
    ["中文目录同名 .md", "content/posts/zh/my-post.md"],
    ["英文目录同名 .mdx", "content/posts/en/my-post.mdx"],
    ["英文目录同名 .md", "content/posts/en/my-post.md"],
    ["扩展名大写的同名文件", "content/posts/zh/my-post.MDX"],
  ])("%s → 撞车，返回那个路径（按路径撞车）", async (_name, path) => {
    await put(checkout, path, "已有\n");
    expect(await findCollision(checkout, await makeDraft())).toEqual({
      kind: "path",
      path,
    });
  });

  it("别人的文章用了相同的 translationKey → 撞车，单独标明是配对键撞了，带上键和那篇文章", async () => {
    await put(
      checkout,
      "content/posts/en/some-other-slug.mdx",
      draftText({ title: "x", locale: "en", translationKey: "my-post" }),
    );
    expect(await findCollision(checkout, await makeDraft())).toEqual({
      kind: "translationKey",
      key: "my-post",
      path: "content/posts/en/some-other-slug.mdx",
    });
  });

  it("同名文件和配对键同时撞：先报同名文件（换 slug 就能解决的先说）", async () => {
    await put(checkout, "content/posts/zh/my-post.mdx", "已有\n");
    await put(
      checkout,
      "content/posts/en/some-other-slug.mdx",
      draftText({ title: "x", locale: "en", translationKey: "my-post" }),
    );
    expect(await findCollision(checkout, await makeDraft())).toEqual({
      kind: "path",
      path: "content/posts/zh/my-post.mdx",
    });
  });

  it("读不出来的别人的文章不影响判断", async () => {
    await put(
      checkout,
      "content/posts/zh/broken.mdx",
      '---\ntitle: "坏\n---\n',
    );
    expect(await findCollision(checkout, await makeDraft())).toBeUndefined();
  });

  it("图片文件夹已存在 → 撞车，哪怕稿子没有图片", async () => {
    await put(checkout, "public/images/posts/my-post/old.png", "旧图");
    expect(await findCollision(checkout, await makeDraft())).toEqual({
      kind: "path",
      path: "public/images/posts/my-post/",
    });
  });
});

describe("copyDraftIn：只新建不覆盖", () => {
  it("把两篇稿子和图片复制进检出目录，内容一致", async () => {
    const draft = await makeDraft(["cover.png", "sub/inner.png"]);

    await copyDraftIn(checkout, draft);

    expect(
      await readFile(join(checkout, "content/posts/zh/my-post.mdx"), "utf8"),
    ).toBe(await readFile(join(folder, "中文稿.mdx"), "utf8"));
    expect(
      await readFile(join(checkout, "content/posts/en/my-post.mdx"), "utf8"),
    ).toBe(await readFile(join(folder, "英文稿.mdx"), "utf8"));
    expect(
      await readFile(
        join(checkout, "public/images/posts/my-post/sub/inner.png"),
        "utf8",
      ),
    ).toBe("sub/inner.png");
  });

  it("目标已经存在：抛 CollisionError，已有内容原样保留", async () => {
    const draft = await makeDraft(["cover.png"]);
    await put(checkout, "content/posts/en/my-post.mdx", "别人的英文版\n");

    const error: unknown = await copyDraftIn(checkout, draft).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(CollisionError);
    expect((error as CollisionError).path).toBe("content/posts/en/my-post.mdx");
    expect(
      await readFile(join(checkout, "content/posts/en/my-post.mdx"), "utf8"),
    ).toBe("别人的英文版\n");
  });

  it("稿子里的文件在复制时已经没了（读出稿子之后被删）：抛 DraftChangedError，不是裸的 ENOENT", async () => {
    const draft = await makeDraft(["cover.png"]);
    await rm(join(folder, "images", "cover.png"));

    const error: unknown = await copyDraftIn(checkout, draft).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(DraftChangedError);
    expect((error as DraftChangedError).source).toBe(
      join(folder, "images", "cover.png"),
    );
  });

  it("图片已存在同样不覆盖", async () => {
    const draft = await makeDraft(["cover.png"]);
    await put(checkout, "public/images/posts/my-post/cover.png", "旧图");

    await expect(copyDraftIn(checkout, draft)).rejects.toBeInstanceOf(
      CollisionError,
    );
    expect(
      await readFile(
        join(checkout, "public/images/posts/my-post/cover.png"),
        "utf8",
      ),
    ).toBe("旧图");
  });
});

describe("copyFormattedBack", () => {
  it("把检出目录里排好版的两篇覆盖回任务文件夹", async () => {
    const draft = await makeDraft();
    await copyDraftIn(checkout, draft);
    await put(checkout, "content/posts/zh/my-post.mdx", "排好版的中文\n");
    await put(checkout, "content/posts/en/my-post.mdx", "formatted english\n");

    await copyFormattedBack(checkout, draft);

    expect(await readFile(join(folder, "中文稿.mdx"), "utf8")).toBe(
      "排好版的中文\n",
    );
    expect(await readFile(join(folder, "英文稿.mdx"), "utf8")).toBe(
      "formatted english\n",
    );
    expect(await exists(join(folder, "slug.txt"))).toBe(true);
  });
});

describe("compareOnlinePost", () => {
  it("线上没有 → absent", async () => {
    expect(await compareOnlinePost(checkout, await makeDraft())).toBe("absent");
  });

  it("线上内容相同 → same；换行符不同也算相同", async () => {
    const draft = await makeDraft();
    const mine = await readFile(join(folder, "中文稿.mdx"), "utf8");
    await put(checkout, "content/posts/zh/my-post.mdx", mine);
    expect(await compareOnlinePost(checkout, draft)).toBe("same");

    await put(
      checkout,
      "content/posts/zh/my-post.mdx",
      mine.replaceAll("\n", "\r\n"),
    );
    expect(await compareOnlinePost(checkout, draft)).toBe("same");
  });

  it("线上内容不同 → different", async () => {
    const draft = await makeDraft();
    await put(checkout, "content/posts/zh/my-post.mdx", "别的内容\n");
    expect(await compareOnlinePost(checkout, draft)).toBe("different");
  });
});

describe("hashCopiedDraft：复制进检出目录的那份稿子的指纹", () => {
  it("刚复制进去：和任务文件夹里同一套稿子的指纹完全一样（含图片）", async () => {
    const draft = await makeDraft(["cover.png", "sub/inner.png"]);
    await copyDraftIn(checkout, draft);

    expect(await hashCopiedDraft(checkout, draft)).toBe(await hashDraft(draft));
  });

  it("读的是检出目录里的复制品：复制品被改了指纹就变，任务文件夹里被改了两边就对不上", async () => {
    const draft = await makeDraft(["cover.png"]);
    await copyDraftIn(checkout, draft);
    const copied = await hashCopiedDraft(checkout, draft);

    // 任务文件夹里的稿子之后被改，检出目录里的复制品没动
    await put(folder, "中文稿.mdx", "检查之后改的\n");
    expect(await hashCopiedDraft(checkout, draft)).toBe(copied);
    expect(await hashDraft(draft)).not.toBe(copied);

    // 检出目录里的复制品被改（比如排版、换了图），指纹跟着变
    await put(checkout, "content/posts/en/my-post.mdx", "formatted\n");
    const formatted = await hashCopiedDraft(checkout, draft);
    expect(formatted).not.toBe(copied);
    await put(checkout, "public/images/posts/my-post/cover.png", "换了图");
    expect(await hashCopiedDraft(checkout, draft)).not.toBe(formatted);
  });
});
