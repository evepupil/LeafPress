import { describe, expect, it } from "vitest";

import { psLiteral } from "../../src/schedule/ps-literal.js";

/** PowerShell 认作单引号的五个字符：ASCII 的 ' 和四个弯单引号 */
const SINGLE_QUOTES = ["'", "\u2018", "\u2019", "\u201A", "\u201B"];

describe("psLiteral", () => {
  it("普通字符串原样包进单引号", () => {
    expect(psLiteral("C:\\Data Files\\中文 & 目录")).toBe(
      "'C:\\Data Files\\中文 & 目录'",
    );
    expect(psLiteral("")).toBe("''");
  });

  it("ASCII 单引号写两遍", () => {
    expect(psLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it.each([
    ["U+2018 ‘", "\u2018"],
    ["U+2019 ’", "\u2019"],
    ["U+201A ‚", "\u201A"],
    ["U+201B ‛", "\u201B"],
  ])("弯单引号 %s 也各写两遍", (_name, quote) => {
    expect(psLiteral(`a${quote}b`)).toBe(`'a${quote}${quote}b'`);
    expect(psLiteral(quote)).toBe(`'${quote}${quote}'`);
    expect(psLiteral(`${quote}${quote}`)).toBe(
      `'${quote}${quote}${quote}${quote}'`,
    );
  });

  it("混用多种单引号时，每一个都各自写两遍", () => {
    const value = "it\u2019s 'quoted' \u2018both\u2019 \u201Alow\u201B";
    expect(psLiteral(value)).toBe(
      "'it\u2019\u2019s ''quoted'' \u2018\u2018both\u2019\u2019 \u201A\u201Alow\u201B\u201B'",
    );
  });

  it("除了开头结尾那一对 ASCII 单引号，字面量里每个单引号字符的个数都是原来的两倍", () => {
    const value = SINGLE_QUOTES.join("x");
    const literal = psLiteral(value);
    const inner = literal.slice(1, -1);
    for (const quote of SINGLE_QUOTES) {
      expect(inner.split(quote).length - 1).toBe(
        2 * (value.split(quote).length - 1),
      );
    }
  });
});
