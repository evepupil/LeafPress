import { describe, expect, it } from "vitest";

import {
  charCount,
  parseCardDeck,
} from "../../../src/platforms/xiaohongshu/cards/parse.js";

/** 页数多的稿子：用来测页数上下限 */
function deckOfMany(pages: number): string {
  const cover = "# 封面";
  const summary = ["## 总结：收尾", "- 一条"].join("\n");
  const points = Array.from({ length: pages - 2 }, (_, index) =>
    [`## 要点${index + 1}`, "- 一条"].join("\n"),
  );
  return [cover, ...points, summary].join("\n\n---\n\n");
}

/** 带副标题和两条要点的 3 页稿子 */
const BASE = [
  "# 封面",
  "副标题一行",
  "",
  "---",
  "",
  "## 第一个要点",
  "- 内容甲",
  "- 内容乙",
  "",
  "---",
  "",
  "## 总结：收尾",
  "- 一条",
].join("\n");

describe("parseCardDeck：合格的稿子", () => {
  it("封面、要点、总结都解析出来", () => {
    expect(parseCardDeck(BASE)).toEqual({
      ok: true,
      deck: {
        pages: [
          { kind: "cover", title: "封面", lines: ["副标题一行"] },
          { kind: "point", title: "第一个要点", lines: ["内容甲", "内容乙"] },
          { kind: "summary", title: "总结：收尾", lines: ["一条"] },
        ],
      },
    });
  });

  it("封面没有副标题时 lines 为空", () => {
    const text = BASE.replace("副标题一行\n", "");
    const result = parseCardDeck(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.pages[0]).toEqual({
        kind: "cover",
        title: "封面",
        lines: [],
      });
    }
  });

  it("页数 3 和 18 都算合格", () => {
    expect(parseCardDeck(deckOfMany(3)).ok).toBe(true);
    expect(parseCardDeck(deckOfMany(18)).ok).toBe(true);
  });

  it("Windows 换行也认", () => {
    expect(parseCardDeck(BASE.replaceAll("\n", "\r\n")).ok).toBe(true);
  });
});

describe("parseCardDeck：结构问题", () => {
  it("空稿子", () => {
    expect(parseCardDeck("")).toEqual({ ok: false, errors: ["卡片稿是空的"] });
  });

  it("页数不够：只有 2 页", () => {
    const text = "# 封面\n\n---\n\n## 总结：收尾\n- 一条";
    const result = parseCardDeck(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        "页数不对：现在 2 页，要 3～18 页（封面 1 张 + 要点页 + 总结 1 张）",
      ]);
    }
  });

  it("页数超了：19 页", () => {
    const result = parseCardDeck(deckOfMany(19));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        "页数不对：现在 19 页，要 3～18 页（封面 1 张 + 要点页 + 总结 1 张）",
      ]);
    }
  });

  it("第一页不是封面：报缺封面", () => {
    const result = parseCardDeck(BASE.replace("# 封面", "## 不是封面"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "缺封面：第 1 页要以「# 」开头（现在是「## 不是封面」）",
      );
    }
  });

  it("最后一页标题不带总结：报缺总结", () => {
    const result = parseCardDeck(
      BASE.replace("## 总结：收尾", "## 最后再说说"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "缺总结：最后一页的标题要以「总结」开头，现在是「最后再说说」",
      );
    }
  });

  it("中间一页不用 ## 开头：报那一页", () => {
    const result = parseCardDeck(
      deckOfMany(4).replace("## 要点1", "### 要点1"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "第 2 页要以「## 」开头（现在是「### 要点1」）",
      );
    }
  });

  it("标记后面没有空格不算标题行：#封面 报缺封面", () => {
    const result = parseCardDeck(BASE.replace("# 封面", "#封面"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "缺封面：第 1 页要以「# 」开头（现在是「#封面」）",
      );
    }
  });

  it("要点页的 ## 后面没有空格不算标题行：报那一页", () => {
    const result = parseCardDeck(BASE.replace("## 第一个要点", "##要点标题"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        "第 2 页要以「## 」开头（现在是「##要点标题」）",
      ]);
    }
  });

  it("总结页的 ## 后面没有空格：报缺总结", () => {
    const result = parseCardDeck(BASE.replace("## 总结：收尾", "##总结：收尾"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "缺总结：最后一页要以「## 」开头（现在是「##总结：收尾」）",
      );
    }
  });

  it("只有标题的要点页报缺内容：不能出一张空卡片", () => {
    const result = parseCardDeck(
      BASE.replace("## 第一个要点\n- 内容甲\n- 内容乙", "## 第一个要点"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(["第 2 页至少要有一条内容，现在只有标题"]);
    }
  });

  it("只有一条空 `- ` 的要点页报缺内容", () => {
    const result = parseCardDeck(BASE.replace("- 内容甲\n- 内容乙", "- "));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(["第 2 页至少要有一条内容，现在只有标题"]);
    }
  });

  it("只有标题的总结页报缺内容", () => {
    const result = parseCardDeck(
      BASE.replace("## 总结：收尾\n- 一条", "## 总结：收尾"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        "缺总结：最后一页至少要有一条内容，现在只有标题",
      ]);
    }
  });

  it("要点行不带 - 开头：报那一行", () => {
    const result = parseCardDeck(BASE.replace("- 内容甲", "内容甲"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "第 2 页第 2 行不是「- 」开头的要点：「内容甲」",
      );
    }
  });
});

describe("parseCardDeck：字数问题", () => {
  it("封面主句超 18 字", () => {
    const long = "一".repeat(19);
    const result = parseCardDeck(BASE.replace("封面", long));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(`封面这句 19 字，超过 18 字：「${long}」`);
    }
  });

  it("封面主句正好 18 字算合格（中英文都按 1 算）", () => {
    expect(parseCardDeck(BASE.replace("封面", "a".repeat(18))).ok).toBe(true);
  });

  it("副标题超 24 字", () => {
    const long = "二".repeat(25);
    const result = parseCardDeck(BASE.replace("副标题一行", long));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        `封面副标题 25 字，超过 24 字：「${long}」`,
      );
    }
  });

  it("封面多写了第二行副标题", () => {
    const result = parseCardDeck(
      BASE.replace("副标题一行", "副标题一行\n再来一行"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        "封面除了主句最多再有一行副标题，现在多了 1 行",
      );
    }
  });

  it("要点页标题超 16 字", () => {
    const long = "三".repeat(17);
    const result = parseCardDeck(BASE.replace("第一个要点", long));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe(
        `第 2 页的标题 17 字，超过 16 字：「${long}」`,
      );
    }
  });

  it("一页超过 5 条", () => {
    const six = ["- 一", "- 二", "- 三", "- 四", "- 五", "- 六"].join("\n");
    const result = parseCardDeck(BASE.replace("- 内容甲\n- 内容乙", six));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe("第 2 页有 6 条，最多 5 条");
    }
  });

  it("一页正文合计超 120 字（空白不算）", () => {
    const body = "- " + "四".repeat(121);
    const result = parseCardDeck(BASE.replace("- 内容甲\n- 内容乙", body));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toBe("第 2 页正文合计 121 字，超过 120 字");
    }
  });

  it("charCount：中英文、空白", () => {
    expect(charCount("ab中文")).toBe(4);
    expect(charCount("a b\tc")).toBe(3);
    expect(charCount("")).toBe(0);
  });
});
