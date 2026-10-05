import { describe, expect, it } from "vitest";

import { redactSecrets } from "../../src/config/redact.js";

describe("redactSecrets：抹密钥", () => {
  it("同一个密钥出现多次，全部替换", () => {
    const text = "key=SECRET-zz9-unique 结尾还有 SECRET-zz9-unique";
    expect(redactSecrets(text, ["SECRET-zz9-unique"])).toBe(
      "key=<redacted> 结尾还有 <redacted>",
    );
  });

  it("多个密钥都能抹掉", () => {
    const text = "A-secret-aaa 和 B-secret-bbbb 同行";
    expect(redactSecrets(text, ["A-secret-aaa", "B-secret-bbbb"])).toBe(
      "<redacted> 和 <redacted> 同行",
    );
  });

  it("先替换长的：长密钥包含短密钥时不会留下残片", () => {
    // 短密钥 "SECRET" 是长密钥 "SECRET-zz9-unique" 的前缀
    const text = "完整的 SECRET-zz9-unique 和单独的 SECRET";
    expect(redactSecrets(text, ["SECRET", "SECRET-zz9-unique"])).toBe(
      "完整的 <redacted> 和单独的 <redacted>",
    );
  });

  it("空串和短于 4 的密钥直接忽略", () => {
    const text = "abc ABCD 保留";
    expect(redactSecrets(text, ["", "abc", "ABCD?no", "ABCD"])).toBe(
      "abc <redacted> 保留",
    );
  });

  it("长度正好 4 的密钥也要抹掉", () => {
    expect(redactSecrets("X abcd Y", ["abcd"])).toBe("X <redacted> Y");
  });

  it("文本里没有密钥时原样返回", () => {
    expect(redactSecrets("什么都没有", ["SECRET-zz9-unique"])).toBe(
      "什么都没有",
    );
  });

  it("重复传入同一个密钥不重复处理", () => {
    expect(
      redactSecrets("a SECRET-zz9-unique b", [
        "SECRET-zz9-unique",
        "SECRET-zz9-unique",
      ]),
    ).toBe("a <redacted> b");
  });
});
