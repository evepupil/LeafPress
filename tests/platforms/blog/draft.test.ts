import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DraftError,
  hashDraft,
  loadDraft,
  readPublishedDay,
  readSlug,
} from "../../../src/platforms/blog/steps/draft.js";
import { draftText } from "./steps-fixtures.js";

let folder = "";

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "leafpress-draft-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

interface FolderContent {
  slug?: string | null;
  chinese?: string | null;
  english?: string | null;
}

async function fill(content: FolderContent = {}): Promise<void> {
  const files: [string, string | null | undefined, string][] = [
    ["slug.txt", content.slug, "my-post\n"],
    [
      "中文稿.mdx",
      content.chinese,
      draftText({ title: "标题", locale: "zh-CN" }),
    ],
    [
      "英文稿.mdx",
      content.english,
      draftText({ title: "Title", locale: "en" }),
    ],
  ];
  for (const [name, value, fallback] of files) {
    if (value === null) continue;
    await writeFile(join(folder, name), value ?? fallback, "utf8");
  }
}

async function failure(): Promise<string> {
  const error: unknown = await loadDraft(folder).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DraftError);
  return (error as DraftError).message;
}

const withDraftFlag = (locale: "zh-CN" | "en", value: string): string =>
  draftText({ title: "标题", locale }).replace("draft: false", value);

describe("loadDraft：稿子校验", () => {
  it("合格的稿子：读出 slug、标题、发布日期、配对键和图片", async () => {
    await fill();
    await mkdir(join(folder, "images", "sub"), { recursive: true });
    await writeFile(join(folder, "images", "b.png"), Buffer.from([2]));
    await writeFile(join(folder, "images", "a.png"), Buffer.from([1]));
    await writeFile(join(folder, "images", "sub", "c.png"), Buffer.from([3]));

    const draft = await loadDraft(folder);

    expect(draft.slug).toBe("my-post");
    expect(draft.chinese).toMatchObject({
      title: "标题",
      published: "2026-10-08",
      translationKey: "test-article",
    });
    expect(draft.english.title).toBe("Title");
    expect(draft.images.map((image) => image.path)).toEqual([
      "a.png",
      "b.png",
      "sub/c.png",
    ]);
  });

  it("没有 images 文件夹也行", async () => {
    await fill();
    expect((await loadDraft(folder)).images).toEqual([]);
  });

  it.each([
    ["没有 slug.txt", { slug: null }, /找不到 slug\.txt/],
    ["slug 是空的", { slug: "  \n" }, /slug\.txt 里的 slug 格式不对/],
    ["slug 有大写", { slug: "My-Post" }, /slug\.txt 里的 slug 格式不对/],
    ["slug 有下划线", { slug: "my_post" }, /slug\.txt 里的 slug 格式不对/],
    ["slug 连着两个连字符", { slug: "a--b" }, /slug\.txt 里的 slug 格式不对/],
    ["slug 以连字符结尾", { slug: "a-" }, /slug\.txt 里的 slug 格式不对/],
    ["slug 用了中文", { slug: "文章" }, /slug\.txt 里的 slug 格式不对/],
    ["slug 里带路径", { slug: "../x" }, /slug\.txt 里的 slug 格式不对/],
    ["没有中文稿", { chinese: null }, /中文稿\.mdx 不存在/],
    ["中文稿是空的", { chinese: " \n\n" }, /中文稿\.mdx 是空的/],
    ["没有英文稿", { english: null }, /英文稿\.mdx 不存在/],
    ["英文稿是空的", { english: "" }, /英文稿\.mdx 是空的/],
  ] satisfies [string, FolderContent, RegExp][])(
    "%s → 失败并说清楚",
    async (_name, content, expected) => {
      await fill(content);
      expect(await failure()).toMatch(expected);
    },
  );

  it.each([
    [
      "中文稿写了 draft: true",
      { chinese: withDraftFlag("zh-CN", "draft: true") },
      "稿子写了 draft: true，博客不会显示，改成 false（中文稿.mdx）",
    ],
    [
      "英文稿写了 draft: true",
      { english: withDraftFlag("en", "draft: true") },
      "稿子写了 draft: true，博客不会显示，改成 false（英文稿.mdx）",
    ],
  ] satisfies [string, FolderContent, string][])(
    "%s",
    async (_name, content, message) => {
      await fill(content);
      expect(await failure()).toBe(message);
    },
  );

  it.each([
    [
      "中文稿的 locale 写成 zh",
      {
        chinese: draftText({ title: "t", locale: "zh-CN" }).replace(
          '"zh-CN"',
          '"zh"',
        ),
      },
      '中文稿.mdx 的 locale 要写 "zh-CN"',
    ],
    [
      "英文稿的 locale 写成 en-US",
      {
        english: draftText({ title: "t", locale: "en" }).replace(
          '"en"',
          '"en-US"',
        ),
      },
      '英文稿.mdx 的 locale 要写 "en"',
    ],
    [
      "published 没加引号",
      {
        chinese: draftText({
          title: "t",
          locale: "zh-CN",
          published: "2026-10-08",
        }),
      },
      '中文稿.mdx 的 published 没加引号，要写成 published: "YYYY-MM-DD"（不带引号会被读成日期，博客的检查过不了）',
    ],
    [
      "published 是不存在的日子",
      {
        chinese: draftText({
          title: "t",
          locale: "zh-CN",
          published: '"2026-02-31"',
        }),
      },
      '中文稿.mdx 的 published 要写成带引号的日期 "YYYY-MM-DD"',
    ],
    [
      "published 格式不对",
      {
        english: draftText({
          title: "t",
          locale: "en",
          published: '"2026/10/08"',
        }),
      },
      '英文稿.mdx 的 published 要写成带引号的日期 "YYYY-MM-DD"',
    ],
    [
      "两篇的 translationKey 不同",
      {
        english: draftText({
          title: "t",
          locale: "en",
          translationKey: "other",
        }),
      },
      '中文稿和英文稿的 translationKey 要相同（现在是 "test-article" 和 "other"）',
    ],
    [
      "缺 title",
      {
        chinese: draftText({ title: "t", locale: "zh-CN" }).replace(
          'title: "t"\n',
          "",
        ),
      },
      "中文稿.mdx 缺少 title",
    ],
    [
      "缺 translationKey",
      {
        chinese: draftText({ title: "t", locale: "zh-CN" }).replace(
          'translationKey: "test-article"\n',
          "",
        ),
      },
      "中文稿.mdx 缺少 translationKey（中英文两篇都要写，并且相同）",
    ],
    ["没有头部", { english: "只有正文\n" }, "英文稿.mdx 缺少 title"],
  ] satisfies [string, FolderContent, string][])(
    "%s",
    async (_name, content, message) => {
      await fill(content);
      expect(await failure()).toBe(message);
    },
  );

  it("头部的 YAML 写坏了：说读不出来", async () => {
    await fill({ chinese: '---\ntitle: "没关引号\n---\n正文\n' });
    expect(await failure()).toMatch(
      /^中文稿\.mdx 的头部（frontmatter）读不出来：/,
    );
  });

  it("images 不是文件夹：失败", async () => {
    await fill();
    await writeFile(join(folder, "images"), "我是文件", "utf8");
    expect(await failure()).toBe("images 应该是文件夹，里面放文章用的图片");
  });

  it("images 里有符号链接：失败（不能把别处的文件带进博客）", async (context) => {
    await fill();
    await mkdir(join(folder, "images"), { recursive: true });
    const target = join(folder, "outside.txt");
    await writeFile(target, "外面的文件", "utf8");
    try {
      await symlink(target, join(folder, "images", "link.png"), "file");
    } catch (error) {
      // Windows 上没有创建符号链接的权限时没法造出这个场景，如实标成跳过
      if ((error as NodeJS.ErrnoException).code === "EPERM") context.skip();
      throw error;
    }
    expect(await failure()).toBe("images 里不能有符号链接：link.png");
  });

  it("images 里有目录联接（junction）：同样当作符号链接拒绝", async (context) => {
    if (process.platform !== "win32") context.skip();
    await fill();
    await mkdir(join(folder, "images"), { recursive: true });
    const outside = join(folder, "outside-dir");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "secret.png"), "外面的图", "utf8");
    await symlink(outside, join(folder, "images", "linked"), "junction");
    expect(await failure()).toBe("images 里不能有符号链接：linked");
  });
});

describe("hashDraft：稿子的指纹", () => {
  async function hash(): Promise<string> {
    return hashDraft(await loadDraft(folder));
  }

  it("同样的内容指纹相同，是 64 位十六进制", async () => {
    await fill();
    const first = await hash();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await hash()).toBe(first);
  });

  it("slug、两篇稿子、图片内容、图片名任何一处变化，指纹都变", async () => {
    await fill();
    await mkdir(join(folder, "images"), { recursive: true });
    await writeFile(join(folder, "images", "cover.png"), Buffer.from([1, 2]));
    const original = await hash();
    const seen = new Set([original]);

    const mutations: [string, () => Promise<void>][] = [
      ["slug.txt", () => writeFile(join(folder, "slug.txt"), "other-post\n")],
      [
        "中文稿",
        () =>
          writeFile(
            join(folder, "中文稿.mdx"),
            draftText({ title: "改过", locale: "zh-CN" }),
          ),
      ],
      [
        "英文稿",
        () =>
          writeFile(
            join(folder, "英文稿.mdx"),
            draftText({ title: "Changed", locale: "en" }),
          ),
      ],
      [
        "图片内容",
        () => writeFile(join(folder, "images", "cover.png"), Buffer.from([9])),
      ],
      [
        "新增图片",
        () => writeFile(join(folder, "images", "extra.png"), Buffer.from([4])),
      ],
    ];
    for (const [name, mutate] of mutations) {
      await mutate();
      const changed = await hash();
      expect(seen.has(changed), `${name} 变了指纹却没变`).toBe(false);
      seen.add(changed);
    }
  });

  it("和图片创建的先后顺序无关", async () => {
    await fill();
    await mkdir(join(folder, "images"), { recursive: true });
    await writeFile(join(folder, "images", "a.png"), Buffer.from([1]));
    await writeFile(join(folder, "images", "b.png"), Buffer.from([2]));
    const first = await hash();

    await rm(join(folder, "images"), { recursive: true });
    await mkdir(join(folder, "images"));
    await writeFile(join(folder, "images", "b.png"), Buffer.from([2]));
    await writeFile(join(folder, "images", "a.png"), Buffer.from([1]));

    expect(await hash()).toBe(first);
  });
});

describe("readSlug 和 readPublishedDay", () => {
  it("读 slug.txt（去掉空白）和中文稿的发布日期", async () => {
    await fill({ slug: "  hello-world \r\n" });
    expect(await readSlug(folder)).toBe("hello-world");
    expect(await readPublishedDay(folder)).toBe("2026-10-08");
  });

  it("发布日期没加引号时报错", async () => {
    await fill({
      chinese: draftText({
        title: "t",
        locale: "zh-CN",
        published: "2026-10-08",
      }),
    });
    await expect(readPublishedDay(folder)).rejects.toThrow(
      "中文稿.mdx 的 published 没加引号",
    );
  });
});
