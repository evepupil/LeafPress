/**
 * M5 小红书端到端的测试环境：临时数据目录 + openApp（真实平台登记表，
 * 排版出图真起本机 Edge），只有 fetch 换成假的（xhslink 短链跳转）。
 * 注意不能用 tests/usecases/helpers.ts 的 withUseCases——它一传选项就把登记表换成假的。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { UseCases } from "@leafpress/core";

import { closeApp, openApp } from "../../src/usecases/context.js";
import { createUseCases } from "../../src/usecases/create.js";
import type { AppContext } from "../../src/usecases/context.js";

/** 固定时钟：今天 2026-10-16（vitest 配了 TZ=Asia/Shanghai） */
export const NOW = new Date("2026-10-16T09:00:00+08:00");
export const TODAY = "2026-10-16";

export interface M5Environment {
  home: string;
  app: AppContext;
  usecases: UseCases;
  close(): Promise<void>;
}

/** 开一个应用：home 在系统临时目录，now 固定，fetch 换成传入的假实现 */
export async function openM5Environment(
  fakeFetch: typeof fetch,
): Promise<M5Environment> {
  const home = await mkdtemp(join(tmpdir(), "leafpress-m5-"));
  let app: AppContext | undefined;
  try {
    let serial = 0;
    app = openApp({
      home,
      now: () => NOW,
      newToken: () => `token-${++serial}`,
      fetch: fakeFetch,
    });
    const usecases = createUseCases(app);
    let closed = false;
    return {
      home,
      app,
      usecases,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        if (app) closeApp(app);
        await rm(home, { recursive: true, force: true });
      },
    };
  } catch (error: unknown) {
    if (app) closeApp(app);
    await rm(home, { recursive: true, force: true });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

// ---------------------------------------------------------------------------
// 归档用的链接

/** 笔记编号：24 位十六进制 */
export const LONG_NOTE_ID = "65f0a1b2c3d4e5f60718293a";
/** 短链：反馈里只贴它 */
export const SHORT_LINK_URL = "http://xhslink.com/a/AbCdEf";
/** 短链 302 跳到的长链里的编号 */
export const SHORT_NOTE_ID = "abcdefabcdefabcdefabcdef";

/** 一段小红书分享文字：长链在中间，带 xsec_token 等参数 */
export const SHARE_TEXT = [
  "19 端到端测试这一篇 很有用！",
  `https://www.xiaohongshu.com/explore/${LONG_NOTE_ID}?xsec_token=ABcdEF0123456789&xsec_source=app_share`,
  "点击查看全文，姐妹们冲",
].join(" ");

/** 假的网络：短链回 302、location 指向长链；其余一律 404（不许访问真实的小红书） */
export interface M5Network {
  fetch: typeof fetch;
  /** 发出去的请求地址，按顺序 */
  requests: string[];
}

export function makeM5Fetch(): M5Network {
  const requests: string[] = [];
  const handler: typeof fetch = (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    requests.push(url);
    if (url === SHORT_LINK_URL) {
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            location: `https://www.xiaohongshu.com/explore/${SHORT_NOTE_ID}?xsec_token=x`,
          },
        }),
      );
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
  return { fetch: handler, requests };
}

// ---------------------------------------------------------------------------
// 测试代替 AI 写的稿子

/** 合格的卡片稿：封面 + 4 张要点页 + 总结页，共 6 页 */
export const GOOD_DECK_MD = [
  "# 端到端测试这一篇",
  "把作品从头走到尾",
  "",
  "---",
  "",
  "## 要点一",
  "- 一条一行",
  "- 每页最多五条",
  "",
  "---",
  "",
  "## 要点二",
  "- 封面在第一页",
  "- 总结在最后一页",
  "",
  "---",
  "",
  "## 要点三",
  "- 页码在右下角",
  "- 出图用本机 Edge",
  "",
  "---",
  "",
  "## 要点四",
  "- 画布一千零八十乘一千四百四十",
  "- 四边留安全区",
  "",
  "---",
  "",
  "## 总结：走完这一遍",
  "- 排版出六张卡片",
].join("\n");

/** 合格的文案稿：标题 8 字、正文两段、5 个话题标签 */
export const GOOD_COPY_MD = [
  "# 端到端测试这一篇",
  "",
  "这一篇把小红书图文卡片从头走到尾。",
  "",
  "卡片图在预览页里竖排，文案在这一段下面，点按钮就能复制。",
  "",
  "#测试 #端到端 #小红书 #卡片 #集成",
].join("\n");

/** 不合格的文案稿：标题 25 字（超 20），正文里有 https:// 链接 */
export const BAD_COPY_MD = [
  "# 一二三四五六七八九十壹贰叁肆伍陆柒捌玖零甲乙丙丁戊",
  "",
  "正文里带一个链接 https://example.test/a ，两条问题一次报出来。",
  "",
  "#测试 #端到端 #小红书",
].join("\n");
