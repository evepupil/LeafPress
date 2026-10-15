import { describe, expect, it } from "vitest";

import { renderCardHtml } from "../../../src/platforms/xiaohongshu/cards/html.js";
import {
  DEFAULT_THEME,
  type CardDeck,
  type CardTheme,
} from "../../../src/platforms/xiaohongshu/cards/types.js";

const deck: CardDeck = {
  pages: [
    { kind: "cover", title: "封面这一句", lines: ["副标题一行"] },
    { kind: "point", title: "要点标题", lines: ["第一条", "第二条", "第三条"] },
    { kind: "summary", title: "总结：全都在这", lines: ["回顾一下"] },
  ],
};

describe("卡片 HTML：三种页的结构", () => {
  it("封面：大标题、副标题、底部强调短线、页码 1 / 3", () => {
    const html = renderCardHtml(deck, 0);
    expect(html).toContain('<div class="page cover">');
    expect(html).toContain("<h1>封面这一句</h1>");
    // 封面不放条目列表
    expect(html).not.toContain('<ul class="lines">');
    expect(html).toContain('<p class="subtitle">副标题一行</p>');
    // 封面独有的底部短线，样式用强调色
    expect(html).toContain('<div class="accent"></div>');
    const rule = html.match(/\.page\.cover \.accent \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("background: #FF2442;");
    expect(html).toContain("1 / 3</p>");
  });

  it("封面没有副标题时不渲染副标题元素", () => {
    const noSubtitle: CardDeck = {
      pages: [{ kind: "cover", title: "只有标题", lines: [""] }],
    };
    const html = renderCardHtml(noSubtitle, 0);
    expect(html).toContain("<h1>只有标题</h1>");
    // 空副标题不出元素（样式规则里出现 .subtitle 不算）
    expect(html).not.toContain('class="subtitle"');
    expect(html).toContain("1 / 1</p>");
  });

  it("要点：标题、每条一行的圆点列表、页码 2 / 3", () => {
    const html = renderCardHtml(deck, 1);
    expect(html).toContain('<div class="page point">');
    expect(html).toContain("<h1>要点标题</h1>");
    // 要点页不套封面的标题居中：标题靠左排
    const titleRule = html.match(/\.page\.point h1 \{[^}]*\}/)?.[0] ?? "";
    expect(titleRule).toContain("text-align: left;");
    const lines = html.match(/<li class="line">.*<\/li>/g) ?? [];
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('<span class="line-text">第一条</span>');
    expect(lines[2]).toContain('<span class="line-text">第三条</span>');
    // 圆点用强调色
    const dotRule = html.match(/\.dot \{[^}]*\}/)?.[0] ?? "";
    expect(dotRule).toContain("background: #FF2442;");
    expect(html).toContain("2 / 3</p>");
  });

  it("总结：标题前有强调色竖条，版式同要点", () => {
    const html = renderCardHtml(deck, 2);
    expect(html).toContain('<div class="page summary">');
    expect(html).toContain("<h1>总结：全都在这</h1>");
    const barRule =
      html.match(/\.page\.summary h1::before \{[^}]*\}/)?.[0] ?? "";
    expect(barRule).toContain("background: #FF2442;");
    expect(html).toContain(
      '<li class="line"><span class="dot"></span><span class="line-text">回顾一下</span></li>',
    );
    expect(html).toContain("3 / 3</p>");
  });
});

describe("卡片 HTML：文字转义", () => {
  it("标题和行里的 <script> 只当文字显示，不成为标签", () => {
    const nasty: CardDeck = {
      pages: [
        {
          kind: "point",
          title: '<script>alert("x")</script>标题',
          lines: ['一行 <b>加粗</b> & "引号"', "<script>var a = 1;</script>"],
        },
      ],
    };
    const html = renderCardHtml(nasty, 0);
    // 解码后能拼回原文：转义掉就解析不成标签
    const decoded = html
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    expect(decoded).toContain('<script>alert("x")</script>标题');
    expect(decoded).toContain('一行 <b>加粗</b> & "引号"');
    // 文档里不能有未转义的 script 标签
    expect(html).not.toMatch(/<script[>\s]/);
    // 只有一个 h1，标题没有被标签打断
    expect(html).toContain(
      "<h1>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;标题</h1>",
    );
  });
});

describe("卡片 HTML：样式全部来自 theme", () => {
  it("默认主题：画布 1080×1440、安全区 96px、字号照搬", () => {
    const html = renderCardHtml(deck, 0, DEFAULT_THEME);
    expect(html).toContain("width: 1080px;");
    expect(html).toContain("height: 1440px;");
    expect(html).toContain("padding: 96px;");
    expect(html).toContain(`font-family: ${DEFAULT_THEME.fontFamily};`);
    expect(html).toContain("background: #FFFFFF;");
    expect(html).toContain("color: #1A1A1A;");
    expect(html).toContain(`font-size: ${DEFAULT_THEME.coverTitle}px;`);
    expect(html).toContain(`font-size: ${DEFAULT_THEME.pointTitle}px;`);
    expect(html).toContain(`font-size: ${DEFAULT_THEME.body}px;`);
    expect(html).toContain(`font-size: ${DEFAULT_THEME.pageNumber}px;`);
    expect(html).toContain(`line-height: ${DEFAULT_THEME.lineHeight};`);
  });

  it("换主题：所有颜色、字号、尺寸都换成新值", () => {
    const theme: CardTheme = {
      ...DEFAULT_THEME,
      width: 640,
      height: 853,
      safe: 40,
      background: "#101010",
      text: "#EEEEEE",
      accent: "#00B4D8",
      muted: "#666666",
      coverTitle: 64,
      pointTitle: 48,
      body: 32,
      pageNumber: 20,
    };
    const cover = renderCardHtml(deck, 0, theme);
    const point = renderCardHtml(deck, 1, theme);
    expect(cover).toContain("width: 640px;");
    expect(cover).toContain("height: 853px;");
    expect(cover).toContain("padding: 40px;");
    expect(cover).toContain("background: #101010;");
    expect(cover).toContain("color: #EEEEEE;");
    // 页码跟安全区走：改的是 muted 和字号
    const pagenum = cover.match(/\.pagenum \{[^}]*\}/)?.[0] ?? "";
    expect(pagenum).toContain("right: 40px;");
    expect(pagenum).toContain("bottom: 40px;");
    expect(pagenum).toContain("color: #666666;");
    expect(pagenum).toContain("font-size: 20px;");
    // 强调色跟主题走
    expect(cover).not.toContain("#FF2442");
    expect(point).toContain("background: #00B4D8;");
    expect(point).not.toContain("background: #FF2442;");
  });

  it("只用系统字体：不加载任何网络资源", () => {
    const html = renderCardHtml(deck, 0);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/url\(/i);
  });

  it("标题和正文允许超长英文词换行", () => {
    const html = renderCardHtml(deck, 1);
    const wrapRule =
      html.match(/h1, \.subtitle, \.line-text \{[^}]*\}/)?.[0] ?? "";
    expect(wrapRule).toContain("overflow-wrap: anywhere;");
    expect(wrapRule).toContain("word-break: break-word;");
  });

  it("页序越界时抛错", () => {
    expect(() => renderCardHtml(deck, 3)).toThrow("卡片页不存在");
  });
});
