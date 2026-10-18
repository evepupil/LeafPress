import { describe, expect, it } from "vitest";

import { devtoolsHttpBase } from "../../../src/platforms/xiaohongshu/cards/cdp.js";

const BROWSER_LOG =
  "\r\nDevTools listening on ws://127.0.0.1:61234/devtools/browser/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b\r\n";

describe("Edge 调试端口的地址", () => {
  it("端口文件写好了：用文件第一行的端口", () => {
    expect(
      devtoolsHttpBase("52345\n/devtools/browser/abc\n", BROWSER_LOG),
    ).toBe("http://127.0.0.1:52345");
  });

  it("日志先于端口文件出来：只取主机和端口，不直接连整个浏览器的 ws 地址", () => {
    // 回归：以前直接连日志里的 ws 地址，连上的是整个浏览器，Page.enable 报「找不到命令」，出图偶发失败
    expect(devtoolsHttpBase(null, BROWSER_LOG)).toBe("http://127.0.0.1:61234");
  });

  it("端口文件写了一半：第一行还没换行时不用，看日志", () => {
    // 真实端口 52345 只写出了「52」：当成端口会一直连错
    expect(devtoolsHttpBase("52", BROWSER_LOG)).toBe("http://127.0.0.1:61234");
    expect(devtoolsHttpBase("52", "")).toBeNull();
    expect(devtoolsHttpBase("", BROWSER_LOG)).toBe("http://127.0.0.1:61234");
    expect(devtoolsHttpBase("5a\n", BROWSER_LOG)).toBe(
      "http://127.0.0.1:61234",
    );
  });

  it("第一行写完了（有换行）：第二行没写完也能用", () => {
    expect(devtoolsHttpBase("52345\r\n", "")).toBe("http://127.0.0.1:52345");
  });

  it("文件和日志都还没有：返回空，调用方再等一轮", () => {
    expect(devtoolsHttpBase(null, "")).toBeNull();
    expect(
      devtoolsHttpBase("", "[1018/211020.123:ERROR] 别的日志\n"),
    ).toBeNull();
  });
});
