import type { CardDeck, CardPage, CardTheme } from "./types.js";
import { DEFAULT_THEME } from "./types.js";

/** HTML 转义：卡片稿是 AI 写的纯文本，一律只当文字显示，不留任何标签和属性 */
function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 正文行：封面只有副标题；要点、总结每条一行，行首一个强调色圆点 */
function linesHtml(page: CardPage): string {
  if (page.kind === "cover") {
    // 副标题可选：空行不出元素，版式不因此多出空隙
    return page.lines
      .filter((line) => line.length > 0)
      .map((line) => `    <p class="subtitle">${esc(line)}</p>`)
      .join("\n");
  }
  const items = page.lines
    .map(
      (line) =>
        `    <li class="line"><span class="dot"></span><span class="line-text">${esc(line)}</span></li>`,
    )
    .join("\n");
  // 要点页可能一行都没有（检查在解析那边拦），空列表不影响结构
  return `    <ul class="lines">\n${items}\n    </ul>`;
}

/** 页码：右下角，「N / 总数」 */
function pageNumberHtml(deck: CardDeck, index: number): string {
  return `${index + 1} / ${deck.pages.length}`;
}

/**
 * 一页卡片的完整 HTML 文档。颜色、字号、字体、安全区全部取自 theme，
 * 模板不写死视觉取值：换主题对象就是换一套外观。只用系统字体，不加载任何网络资源。
 */
export function renderCardHtml(
  deck: CardDeck,
  index: number,
  theme: CardTheme = DEFAULT_THEME,
): string {
  const page = deck.pages[index];
  if (!page) {
    // 页序越界是调用方的程序错误（steps 会保证在页数内），抛错而不是悄悄渲染空白页
    throw new Error(`卡片页不存在：第 ${index} 页，共 ${deck.pages.length} 页`);
  }

  // 封面标题「居中偏上」：往下挪的高度从画布高推出来，跟着主题走
  const coverTop = Math.round(theme.height * 0.18);
  // 竖条跟标题同高，圆点和短线也从字号推尺寸，主题改字号时装饰跟着缩放
  const barHeight = Math.round(theme.pointTitle * theme.lineHeight);
  const dotSize = Math.round(theme.body * 0.36);
  const accentWidth = Math.round(theme.coverTitle * 2);

  const styles = `
    html, body { margin: 0; padding: 0; }
    body {
      box-sizing: border-box;
      /* 页码绝对定位要有参照，body 就是整张画布 */
      position: relative;
      width: ${theme.width}px;
      height: ${theme.height}px;
      /* 四边安全区：安全区内不放字 */
      padding: ${theme.safe}px;
      overflow: hidden;
      background: ${theme.background};
      color: ${theme.text};
      font-family: ${theme.fontFamily};
      line-height: ${theme.lineHeight};
    }
    .page {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    h1 {
      margin: 0;
      font-weight: bold;
      font-size: ${theme.coverTitle}px;
      text-align: center;
    }
    h1, .subtitle, .line-text {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .page.point h1 {
      display: flex;
      align-items: center;
      gap: ${Math.round(theme.pointTitle * 0.4)}px;
      text-align: left;
      font-size: ${theme.pointTitle}px;
      line-height: 1.3;
    }
    /* 总结页标题前的强调色竖条 */
    .page.summary h1::before {
      content: "";
      flex: none;
      width: ${Math.round(theme.pointTitle * 0.2)}px;
      height: ${barHeight}px;
      border-radius: ${Math.round(theme.pointTitle * 0.1)}px;
      background: ${theme.accent};
    }
    /* 封面底部那条强调色短线（副标题在标题下面，短线沉到页底） */
    .page.cover .accent {
      margin-top: auto;
      flex: none;
      width: ${accentWidth}px;
      height: ${Math.round(theme.coverTitle * 0.15)}px;
      border-radius: ${Math.round(theme.coverTitle * 0.075)}px;
      background: ${theme.accent};
    }
    .subtitle {
      margin: ${Math.round(theme.body * 0.6)}px 0 0;
      font-size: ${theme.body}px;
      color: ${theme.muted};
      text-align: center;
    }
    .lines {
      list-style: none;
      margin: ${Math.round(theme.body)}px 0 0;
      padding: 0;
      font-size: ${theme.body}px;
    }
    .line {
      display: flex;
      align-items: baseline;
      gap: ${Math.round(theme.body * 0.5)}px;
      margin: 0 0 ${Math.round(theme.body * 0.4)}px;
    }
    /* 要点行首的强调色圆点：基线对齐，贴着第一行文字 */
    .dot {
      flex: none;
      width: ${dotSize}px;
      height: ${dotSize}px;
      border-radius: 50%;
      background: ${theme.accent};
    }
    .pagenum {
      position: absolute;
      right: ${theme.safe}px;
      bottom: ${theme.safe}px;
      margin: 0;
      font-size: ${theme.pageNumber}px;
      color: ${theme.muted};
    }
  `;

  const coverTopRule = `.page.cover h1 { margin-top: ${coverTop}px; }\n    `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>卡片 ${index + 1}</title>
<style>
    ${styles.trim()}
    ${coverTopRule}</style>
</head>
<body>
  <div class="page ${page.kind}">
    <h1>${esc(page.title)}</h1>
${linesHtml(page)}
${page.kind === "cover" ? `    <div class="accent"></div>\n` : ""}  </div>
  <p class="pagenum">${pageNumberHtml(deck, index)}</p>
</body>
</html>
`;
}
