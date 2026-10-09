/**
 * M3 知乎端到端的测试环境：临时数据目录 + openApp（真实平台登记表），
 * 只有 fetch 换成假的。注意不能用 tests/usecases/helpers.ts 的 withUseCases——
 * 它一传选项就把登记表换成假的。
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { UseCases } from "@leafpress/core";

import { closeApp, openApp } from "../../src/usecases/context.js";
import { createUseCases } from "../../src/usecases/create.js";
import type { AppContext } from "../../src/usecases/context.js";

/** 固定时钟：今天 2026-10-08，昨天 2026-10-07（vitest 配了 TZ=Asia/Shanghai） */
export const NOW = new Date("2026-10-08T09:00:00+08:00");
export const TODAY = "2026-10-08";
export const YESTERDAY = "2026-10-07";
/** 一看就是假的密钥 */
export const ACCESS_SECRET = "fakeAccessSecret0001";
export const SITE_URL = "https://blog.example.test";

export interface M3Environment {
  home: string;
  app: AppContext;
  usecases: UseCases;
  /** 把固定时钟改到另一天（归档后再拉那步推到明天用） */
  setNow(next: Date): void;
  close(): Promise<void>;
}

/** 开一个应用：home 在系统临时目录，now 固定，fetch 换成传入的假实现 */
export async function openM3Environment(
  fakeFetch: typeof fetch,
): Promise<M3Environment> {
  const home = await mkdtemp(join(tmpdir(), "leafpress-m3-"));
  let app: AppContext | undefined;
  try {
    let serial = 0;
    let current = NOW;
    app = openApp({
      home,
      now: () => current,
      newToken: () => `token-${++serial}`,
      fetch: fakeFetch,
    });
    const usecases = createUseCases(app);
    let closed = false;
    return {
      home,
      app,
      usecases,
      setNow(next: Date): void {
        current = next;
      },
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

/** 一张假 PNG 的字节（能读出来 base64 就行） */
export const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

export const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;

/** 测试代替 AI 写的改写稿：有站内链接、站内图片、mermaid 图 */
export const REWRITE_DRAFT = [
  "# 改写后的标题",
  "",
  "看[旧文](/posts/demo/)，图在下面。",
  "",
  "![配图](/images/posts/demo/a.png)",
  "",
  "```mermaid",
  "flowchart TD",
  "  A-->B",
  "```",
  "",
].join("\n");

/**
 * 在 home 里造一个假的博客仓库：content/posts/zh/demo.mdx（原稿）、
 * public/images/posts/demo/a.png（复制页要内嵌的图）。返回原稿位置。
 */
export async function makeBlogRepo(home: string): Promise<string> {
  const repo = join(home, "blog-repo");
  const post = join(repo, "content", "posts", "zh", "demo.mdx");
  await mkdir(dirname(post), { recursive: true });
  await writeFile(post, "原稿正文\n", "utf8");
  const image = join(repo, "public", "images", "posts", "demo", "a.png");
  await mkdir(dirname(image), { recursive: true });
  await writeFile(image, Buffer.from(PNG_BYTES));
  return post;
}

/**
 * 插入一条已完成的博客作品（url/localPath 齐全），返回它的 id。
 * import.test.ts 里那套「直接改记录库」的夹具写法。
 */
export function insertPublishedBlogWork(
  app: AppContext,
  accountId: string,
  localPath: string,
  siteUrl: string,
): string {
  // 一个已完成的博客作品：带 url 和 localPath（插入记录库的夹具写法，同 import.test.ts）
  app.store.transaction(() =>
    app.store.works.insert({
      id: `b-${app.store.meta.nextSerial("work")}`,
      title: "博客里已发布的文章",
      accountId,
      status: "done",
      brief: "",
      source: { kind: "none" },
      workflowId: "blog-write",
      step: 6,
      feedbackHistory: [],
      order: 100,
      createdAt: "2026-09-01T09:00:00+08:00",
      updatedAt: "2026-09-20T09:00:00+08:00",
      url: `${siteUrl}/posts/demo/`,
      publishedAt: "2026-09-20",
      localPath,
      tags: [],
      log: [],
    }),
  );
  const blogWorkId = app.store.works
    .list()
    .find((work) => work.url === `${siteUrl}/posts/demo/`)?.id;
  if (!blogWorkId) throw new Error("博客作品没插进去");
  return blogWorkId;
}
