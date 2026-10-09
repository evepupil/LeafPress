/** redactUrlCredentials 的测试：git 错误信息里的账号信息（口令、令牌）必须被抹掉 */
import { describe, expect, it } from "vitest";

import { redactUrlCredentials } from "../../../src/platforms/blog/url-redact.js";

describe("redactUrlCredentials", () => {
  it("带冒号的写法（用户:口令@）：整段抹成 ***，其余部分不变", () => {
    expect(
      redactUrlCredentials(
        "fatal: unable to access 'https://user:secret@example.com/repo.git/': xx",
      ),
    ).toBe("fatal: unable to access 'https://***@example.com/repo.git/': xx");
  });

  it("不带冒号的写法（令牌放在用户名位置）：同样抹掉", () => {
    // git 在不许弹提示时输出的就是这一句；令牌用一看就是假的值
    expect(
      redactUrlCredentials(
        "fatal: could not read Password for 'https://ghp_FAKE_TOKEN_FOR_TEST@github.com': terminal prompts disabled",
      ),
    ).toBe(
      "fatal: could not read Password for 'https://***@github.com': terminal prompts disabled",
    );
  });

  it("ssh://git@host 这样的写法：@ 前面的也一并抹掉（分不出是用户名还是令牌）", () => {
    expect(
      redactUrlCredentials("fatal: unable to connect to ssh://git@host/x.git"),
    ).toBe("fatal: unable to connect to ssh://***@host/x.git");
  });

  it("没有账号信息的网址原样返回", () => {
    const url = "https://example.com/repo.git";
    expect(redactUrlCredentials(url)).toBe(url);
  });

  it("ssh 的 scp 写法（没有 ://）原样返回", () => {
    expect(redactUrlCredentials("git@host:path")).toBe("git@host:path");
  });

  it("其它协议的账号口令也被抹掉", () => {
    expect(redactUrlCredentials("ftp://alice:pw@host/x")).toBe(
      "ftp://***@host/x",
    );
  });

  it("多个网址里的账号信息都抹掉，带冒号和不带冒号的混着也行", () => {
    expect(
      redactUrlCredentials("from https://a:b@x.com to https://c@y.com"),
    ).toBe("from https://***@x.com to https://***@y.com");
  });

  it("口令里有没转义的 @：整段抹掉，不留尾巴", () => {
    expect(redactUrlCredentials("https://user:p@ss@host/x.git")).toBe(
      "https://***@host/x.git",
    );
  });

  it("路径或后文里的 @ 不是账号信息：不误伤", () => {
    expect(redactUrlCredentials("https://example.com/a@b/c")).toBe(
      "https://example.com/a@b/c",
    );
    expect(
      redactUrlCredentials("见 https://example.com 联系 me@example.com"),
    ).toBe("见 https://example.com 联系 me@example.com");
  });

  it("跨行不合并：网址和下一行的 @ 不会被连成一个账号信息", () => {
    expect(redactUrlCredentials("see https://example.com\nmail me@x.com")).toBe(
      "see https://example.com\nmail me@x.com",
    );
  });
});
