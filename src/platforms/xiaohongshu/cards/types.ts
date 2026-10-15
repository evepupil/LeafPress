/**
 * 小红书卡片出图的共用接口（主控定，几路苦工照它写）：卡片组的数据形状、样式、出图器。
 * 规格见 docs/模块设计/平台适配-小红书.md。
 * - 解析卡片稿（cards/parse.ts 的 parseCardDeck）归「代码步骤」那一路；
 * - 一页卡片的 HTML（cards/html.ts 的 renderCardHtml）和本机 Edge 出图（cards/edge.ts 的 createEdgeCardRenderer）归「出图」那一路。
 */

export type CardPageKind = "cover" | "point" | "summary";

export interface CardPage {
  kind: CardPageKind;
  /** 封面：那一句勾人的话；要点、总结：这一页的标题（总结页带「总结」开头） */
  title: string;
  /** 封面：副标题，0 或 1 行；要点、总结：每条一行，不含开头的「- 」 */
  lines: string[];
}

export interface CardDeck {
  pages: CardPage[];
}

export type CardDeckResult =
  { ok: true; deck: CardDeck } | { ok: false; errors: string[] };

/** 卡片样式：默认是素净样式，作者挑定视觉方向后只换这个对象 */
export interface CardTheme {
  width: number;
  height: number;
  /** 四边不放字的安全区（像素） */
  safe: number;
  background: string;
  text: string;
  accent: string;
  muted: string;
  fontFamily: string;
  coverTitle: number;
  pointTitle: number;
  body: number;
  lineHeight: number;
  pageNumber: number;
}

export const DEFAULT_THEME: CardTheme = {
  width: 1080,
  height: 1440,
  safe: 96,
  background: "#FFFFFF",
  text: "#1A1A1A",
  accent: "#FF2442",
  muted: "#8A8A8A",
  fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
  coverTitle: 80,
  pointTitle: 60,
  body: 40,
  lineHeight: 1.6,
  pageNumber: 28,
};

export interface CardRenderResult {
  /** 出图的文件名（不含目录），按页序：01.png、02.png…… */
  files: string[];
  /** 从起 Edge 到全部截完的毫秒数 */
  millis: number;
}

export interface CardRenderOptions {
  theme?: CardTheme;
  /** 出图要跑一阵子时调，给作品的租约续期 */
  heartbeat?(): void;
}

export interface CardRenderer {
  /** 把整组卡片截成 outDir/01.png、02.png……（outDir 已存在，旧图由调用方清掉） */
  render(
    deck: CardDeck,
    outDir: string,
    options?: CardRenderOptions,
  ): Promise<CardRenderResult>;
}
