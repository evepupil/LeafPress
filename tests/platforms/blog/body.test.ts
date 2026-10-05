import { describe, expect, it } from "vitest";

import {
  analyzeBody,
  isInternalLink,
} from "../../../src/platforms/blog/body.js";

describe("analyzeBody", () => {
  it("普通图片和 HTML 图片都按出现顺序收进 images，重复的也保留", () => {
    const markdown = [
      "![一张图](/images/a.png)",
      "",
      "<img src='/images/b.png' alt='b'>",
      "",
      '<img src="https://example.com/c.png" />',
      "",
      "![重复](/images/a.png)",
    ].join("\n");
    const analysis = analyzeBody(markdown);
    expect(analysis.images).toEqual([
      "/images/a.png",
      "/images/b.png",
      "https://example.com/c.png",
      "/images/a.png",
    ]);
    expect(analysis.mermaidBlockCount).toBe(0);
    expect(analysis.internalLinks).toEqual([]);
  });

  it("引用式图片按同文的 definition 解析出地址", () => {
    const markdown = ["![图一][img1]", "", "[img1]: /images/ref.png"].join(
      "\n",
    );
    expect(analyzeBody(markdown).images).toEqual(["/images/ref.png"]);
  });

  it("引用式图片没有对应 definition 时不算进 images", () => {
    const markdown = "![图一][missing]";
    expect(analyzeBody(markdown).images).toEqual([]);
  });

  it("mermaid 代码块计数，其他语言标记不算", () => {
    const markdown = [
      "```mermaid",
      "graph TD; A-->B;",
      "```",
      "",
      "```ts",
      "const a = 1;",
      "```",
      "",
      "```mermaid",
      "sequenceDiagram; A->>B: hi",
      "```",
    ].join("\n");
    expect(analyzeBody(markdown).mermaidBlockCount).toBe(2);
  });

  it("站内链接：绝对地址、相对地址、引用式都收，外链、锚点、mailto 不收", () => {
    const markdown = [
      "[内部绝对](/docs/quick-start)",
      "[内部相对](./other-post)",
      "[内部相对二](../guides/setup)",
      "[外链](https://example.com/page)",
      "[锚点](#section)",
      "[邮件](mailto:a@example.com)",
      "[协议相对](//cdn.example.com/x)",
      "[引用式][ref1]",
      "",
      "[ref1]: /docs/ref-target",
    ].join("\n");
    expect(analyzeBody(markdown).internalLinks).toEqual([
      "/docs/quick-start",
      "./other-post",
      "../guides/setup",
      "/docs/ref-target",
    ]);
  });

  it("图片地址不算链接", () => {
    const markdown = "![内部图片](/images/inner.png)";
    const analysis = analyzeBody(markdown);
    expect(analysis.images).toEqual(["/images/inner.png"]);
    expect(analysis.internalLinks).toEqual([]);
  });

  it("带 MDX 组件和 import 的正文解析不报错", () => {
    const markdown = [
      "import { Callout } from 'nextra/components'",
      "",
      "export const meta = { title: '示例' }",
      "",
      "<Callout type='info'>",
      "  注意事项",
      "</Callout>",
      "",
      "正文一段 <Component prop={value} /> 继续。",
      "",
      "![图](/images/mdx.png)",
    ].join("\n");
    const analysis = analyzeBody(markdown);
    expect(analysis.images).toEqual(["/images/mdx.png"]);
    expect(analysis.mermaidBlockCount).toBe(0);
  });
});

describe("isInternalLink", () => {
  it("以单个 / 开头是站内，// 开头、锚点、带协议不是站内，其余相对地址是站内", () => {
    expect(isInternalLink("/docs/x")).toBe(true);
    expect(isInternalLink("//example.com/x")).toBe(false);
    expect(isInternalLink("#top")).toBe(false);
    expect(isInternalLink("mailto:a@b.c")).toBe(false);
    expect(isInternalLink("https://example.com")).toBe(false);
    expect(isInternalLink("images/a.png")).toBe(true);
    expect(isInternalLink("../x")).toBe(true);
  });

  it("真实数据的嵌套链接 [文字](<[https://x](https://x)>)：算外链，不算站内", () => {
    expect(isInternalLink("<[https://x](https://x)>")).toBe(false);
    expect(isInternalLink("[https://x](https://x)")).toBe(false);
    const analysis = analyzeBody(
      "嵌套一 [文字](<[https://x](https://x)>) 结束\n",
    );
    expect(analysis.internalLinks).toEqual([]);
  });

  it("guides/v1://overview 这类相对地址不是外链，算站内", () => {
    // "guides/v1://overview" 不以协议开头、不以 // 开头、不是嵌套形态，是站内相对地址
    expect(isInternalLink("guides/v1://overview")).toBe(true);
    const analysis = analyzeBody("看 [指南](guides/v1://overview) 了解\n");
    expect(analysis.internalLinks).toEqual(["guides/v1://overview"]);
  });
});
