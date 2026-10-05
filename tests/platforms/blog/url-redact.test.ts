/** redactUrlCredentials 的测试：git 错误信息里的账号口令必须被抹掉 */
import { describe, expect, it } from "vitest";

import { redactUrlCredentials } from "../../../src/platforms/blog/url-redact.js";

describe("redactUrlCredentials", () => {
  it("https 网址里的用户名口令被抹成 <redacted>，其余部分不变", () => {
    expect(
      redactUrlCredentials(
        "fatal: unable to access 'https://user:secret@example.com/repo.git/': xx",
      ),
    ).toBe(
      "fatal: unable to access 'https://<redacted>@example.com/repo.git/': xx",
    );
  });

  it("没有账号口令的网址原样返回", () => {
    const url = "https://example.com/repo.git";
    expect(redactUrlCredentials(url)).toBe(url);
  });

  it("ssh 形式（无账号口令）原样返回", () => {
    expect(redactUrlCredentials("git@host:path")).toBe("git@host:path");
  });

  it("其它协议的账号口令也被抹掉", () => {
    expect(redactUrlCredentials("ftp://alice:pw@host/x")).toBe(
      "ftp://<redacted>@host/x",
    );
  });

  it("多个网址里的口令都抹掉", () => {
    expect(
      redactUrlCredentials("from https://a:b@x.com to https://c:d@y.com"),
    ).toBe("from https://<redacted>@x.com to https://<redacted>@y.com");
  });
});
