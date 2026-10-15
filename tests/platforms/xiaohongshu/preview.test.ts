import { describe, expect, it } from "vitest";

import type { CopyDraft } from "../../../src/platforms/xiaohongshu/steps/copy.js";
import {
  buildPreviewPage,
  copyPlainText,
} from "../../../src/platforms/xiaohongshu/steps/preview.js";

const COPY: CopyDraft = {
  title: '标题 <有尖括号> & 引号"',
  body: "正文一行。\n带 <b>标签</b> 的第二行。",
  tags: ["标签一", "标签二", "标签三"],
};

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

describe("发布稿预览页", () => {
  it("卡片图按页序内嵌成 data URL，竖排", () => {
    const html = buildPreviewPage({
      images: [
        { file: "01.png", bytes: PNG },
        { file: "02.png", bytes: PNG },
      ],
      copy: COPY,
    });
    const tags = html.match(/<img [^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    // 第 1 张在页面靠前
    expect(html.indexOf(tags[0] ?? "")).toBeLessThan(
      html.indexOf(tags[1] ?? ""),
    );
    expect(tags[0]).toContain('src="data:image/png;base64,');
  });

  it("文案里的尖括号、引号、& 都转义", () => {
    const html = buildPreviewPage({ images: [], copy: COPY });
    expect(html).toContain("<h1>标题 &lt;有尖括号&gt; &amp; 引号&quot;</h1>");
    expect(html).toContain("带 &lt;b&gt;标签&lt;/b&gt; 的第二行。");
    // 页面上不能出现未转义的标签
    expect(html).not.toContain("<b>标签</b>");
  });

  it("复制按钮用 text/plain 写剪贴板，带 execCommand 降级", () => {
    const html = buildPreviewPage({ images: [], copy: COPY });
    expect(html).toContain("复制文案");
    expect(html).toContain("navigator.clipboard.writeText(text)");
    expect(html).toContain("document.execCommand('copy')");
  });

  it("复制用的原文放在 JSON script 里，从里面拿出来的文本保留换行", () => {
    const html = buildPreviewPage({ images: [], copy: COPY });
    const block =
      /<script type="application\/json" id="copyRaw">\n([\s\S]*?)\n\s*<\/script>/.exec(
        html,
      );
    // 浏览器拿到的是 textContent（script 里不做实体还原），页面脚本再 JSON.parse：结果就是进剪贴板的原文
    const raw = block?.[1] ?? "";
    expect(raw).not.toContain("<"); // 不会提前闭合 script
    const copied = JSON.parse(raw) as string;
    expect(copied).toBe(copyPlainText(COPY));
    expect(copied).toContain("<有尖括号>"); // 尖括号原样进剪贴板，不是 &lt;
    expect(copied).toContain("\n\n");
    // 原文不再放属性里：属性值里的换行在拿到时已经丢了
    expect(html).not.toContain("data-raw");
    expect(html).not.toContain(`alt="${copyPlainText(COPY)}`);
  });

  it("copyPlainText：标题、正文、标签行按行拼起来", () => {
    expect(copyPlainText(COPY)).toBe(
      '标题 <有尖括号> & 引号"\n\n正文一行。\n带 <b>标签</b> 的第二行。\n\n#标签一 #标签二 #标签三',
    );
  });
});
