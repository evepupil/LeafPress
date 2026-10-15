import { describe, expect, it } from "vitest";

import { parseCopy } from "../../../src/platforms/xiaohongshu/steps/copy.js";

describe("parseCopy：合格的稿子", () => {
  it("标题、正文、标签都摘出来", () => {
    const text = [
      "# 三分钟看完这篇",
      "",
      "正文第一行。",
      "",
      "正文第二行。",
      "",
      "#标签一 #标签二 #标签三",
    ].join("\n");
    expect(parseCopy(text)).toEqual({
      ok: true,
      draft: {
        title: "三分钟看完这篇",
        body: "正文第一行。\n\n正文第二行。",
        tags: ["标签一", "标签二", "标签三"],
      },
    });
  });

  it("标签 3 个和 8 个都算合格", () => {
    const three = ["# 标题", "", "#一 #二 #三"].join("\n");
    expect(parseCopy(three).ok).toBe(true);
    const eight = [
      "# 标题",
      "",
      Array.from({ length: 8 }, (_, i) => `#tag${i + 1}`).join(" "),
    ].join("\n");
    expect(parseCopy(eight).ok).toBe(true);
  });

  it("标题正好 20 字、正文正好 1000 字（中英文都按 1 算）", () => {
    const at = [
      "# " + "a".repeat(20),
      "",
      "正".repeat(1000),
      "",
      "#一 #二 #三",
    ].join("\n");
    expect(parseCopy(at).ok).toBe(true);
  });

  it("Windows 换行也认", () => {
    const text = "# 标题\r\n正文\r\n#一 #二 #三";
    expect(parseCopy(text).ok).toBe(true);
  });
});

describe("parseCopy：标题和正文", () => {
  it("空稿子", () => {
    expect(parseCopy("")).toEqual({ ok: false, errors: ["文案是空的"] });
  });

  it("第一行不是 # 标题", () => {
    const result = parseCopy("标题\n正文\n#一 #二 #三");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe("第一行要是「# 标题」，现在是「标题」");
    }
  });

  it("标题超 20 字", () => {
    const long = "标".repeat(21);
    const result = parseCopy(`# ${long}\n正文\n#一 #二 #三`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(`标题 21 字，超过 20 字：「${long}」`);
    }
  });

  it("正文超 1000 字（空白不算）", () => {
    const result = parseCopy(
      ["# 标题", "", "文".repeat(1001), "", "#一 #二 #三"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe("正文合计 1001 字，超过 1000 字");
    }
  });
});

describe("parseCopy：话题标签", () => {
  it("最后一行不是标签行", () => {
    const result = parseCopy("# 标题\n正文\n最后一行是正文");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "最后一行要写 3～8 个话题标签（#话题 用空格分开），现在是「最后一行是正文」",
      );
    }
  });

  it("标签只有 2 个", () => {
    const result = parseCopy("# 标题\n正文\n#一 #二");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe("话题标签 2 个，要 3～8 个");
    }
  });

  it("标签超过 8 个", () => {
    const tags = Array.from({ length: 9 }, (_, i) => `#tag${i + 1}`).join(" ");
    const result = parseCopy(`# 标题\n正文\n${tags}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe("话题标签 9 个，要 3～8 个");
    }
  });

  it("标签行里混着不带 # 的段不算：每一段都得是 #话题", () => {
    const result = parseCopy("# 标题\n正文\n#甲 乙 #丙");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "最后一行要写 3～8 个话题标签（#话题 用空格分开），现在是「#甲 乙 #丙」",
      );
    }
  });

  it("只有 # 没有话题名的段不算", () => {
    const result = parseCopy("# 标题\n正文\n#一 #二 #");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "最后一行要写 3～8 个话题标签（#话题 用空格分开），现在是「#一 #二 #」",
      );
    }
  });
});

describe("parseCopy：链接", () => {
  it("正文里出现 http：判违规", () => {
    const result = parseCopy("# 标题\n看 https://example.com/a\n#一 #二 #三");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        "文案里不能出现 http 链接：小红书里点不了，也可能被判违规",
      );
    }
  });

  it("不带协议的裸 http 也拦（HTTPS 也算）", () => {
    const result = parseCopy("# 标题\n看 HTTPS://example.com\n#一 #二 #三");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        "文案里不能出现 http 链接：小红书里点不了，也可能被判违规",
      );
    }
  });
});

describe("parseCopy：多个问题一次报出", () => {
  it("标题超长、标签不够、带链接三条一起", () => {
    const long = "标".repeat(25);
    const result = parseCopy(`# ${long}\n正文 https://example.com\n#一 #二`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        `标题 25 字，超过 20 字：「${long}」`,
        "话题标签 2 个，要 3～8 个",
        "文案里不能出现 http 链接：小红书里点不了，也可能被判违规",
      ]);
    }
  });
});
