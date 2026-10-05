import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeConfigIfAbsent } from "../../src/config/load.js";
import { createCliContext } from "../../src/cli/context.js";
import {
  executePosts,
  renderPosts,
  type PostsSourceResult,
  type PostsTargetResult,
} from "../../src/cli/commands/posts.js";
import { displayWidth, truncateByWidth } from "../../src/cli/output.js";
import { execCommand } from "../../src/shared/exec.js";
import { PlatformRegistry } from "../../src/platforms/registry.js";
import type { Store } from "../../src/store/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function addPost(
  repoPath: string,
  localeDir: string,
  slug: string,
  title: string,
  published: string,
  locale: string,
  extra = "",
): Promise<void> {
  const directory = join(repoPath, "content", "posts", localeDir);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${slug}.md`),
    `---\ntitle: "${title}"\npublished: ${published}\nlocale: ${locale}\n${extra}---\n\n正文 ${title}。\n`,
    "utf8",
  );
}

async function makeGitRepo(repoPath: string): Promise<void> {
  await mkdir(repoPath, { recursive: true });
  expect(
    (await execCommand("git", ["init", "-b", "main"], { cwd: repoPath }))
      .exitCode,
  ).toBe(0);
  expect(
    (await execCommand("git", ["add", "."], { cwd: repoPath })).exitCode,
  ).toBe(0);
  expect(
    (
      await execCommand(
        "git",
        [
          "-c",
          "user.name=test",
          "-c",
          "user.email=test@example.com",
          "commit",
          "-m",
          "initial",
        ],
        { cwd: repoPath },
      )
    ).exitCode,
  ).toBe(0);
}

async function setup(): Promise<{
  context: ReturnType<typeof createCliContext>;
  repoPath: string;
}> {
  tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-posts-"));
  const repoPath = join(tempDir, "blog");
  await addPost(
    repoPath,
    "zh",
    "newest",
    "最新原稿",
    "2026-03-01",
    "zh-CN",
    "draft: true\n",
  );
  await addPost(repoPath, "zh", "older", "较早原稿", "2026-01-01", "zh-CN");
  await addPost(
    repoPath,
    "en",
    "english",
    "English source",
    "2026-02-01",
    "en",
  );
  await addPost(repoPath, "en", "invalid", "坏元数据", "not-a-date", "en");
  await makeGitRepo(repoPath);
  const home = join(tempDir, "data");
  await writeConfigIfAbsent(home, {
    version: 1,
    materials: { projects: [] },
    zhihu: {},
    browser: {},
    blog: {
      repoPath,
      contentDir: "content/posts",
      remote: "origin",
      branch: "main",
      primaryLocaleDir: "zh",
    },
  });
  return {
    repoPath,
    context: createCliContext(
      { home },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    ),
  };
}

describe("posts 命令", () => {
  it("按默认语言过滤，支持 all 和最新篇数限制", async () => {
    const { context } = await setup();
    try {
      const defaultResult = await executePosts(context);
      expect(defaultResult.sources.map((source) => source.ref)).toEqual([
        "zh/newest",
        "zh/older",
      ]);
      expect(defaultResult.sources[0]?.draft).toBe(true);
      expect(defaultResult.issues).toEqual([]);
      const targets = (await context.getRegistry()).publishTargets({
        excludePlatforms: ["blog"],
      });
      const output = renderPosts(defaultResult, targets);
      expect(output).toContain("知乎·长文");
      expect(output).toContain("知乎·回答");
      expect(output).toContain("最新原稿（草稿）");
      expect(output).toContain("知乎·长文 已发 0 篇");

      const allResult = await executePosts(context, {
        locale: "all",
        limit: "2",
      });
      expect(allResult.sources.map((source) => source.ref)).toEqual([
        "zh/newest",
        "en/english",
      ]);
      expect(allResult.issues).toHaveLength(1);
      expect(allResult.issues[0]?.path).toContain("invalid.md");
    } finally {
      context.close();
    }
  });

  it("同步失败时仍继续读取本地原稿", async () => {
    const { context } = await setup();
    try {
      const result = await executePosts(context, { sync: true });
      expect(result.sync?.action).toBe("failed");
      expect(result.sync?.message).toBeTruthy();
      expect(result.sources).toHaveLength(2);
    } finally {
      context.close();
    }
  });

  it("同步器抛异常时仍继续读取并入库本地原稿", async () => {
    const { context } = await setup();
    try {
      const baseRegistry = await context.getRegistry();
      const blog = baseRegistry.get("blog");
      if (blog.sources === undefined) throw new Error("缺少博客原稿来源");
      const registry = new PlatformRegistry();
      registry.register({
        ...blog,
        sources: {
          ...blog.sources,
          sync: () => Promise.reject(new Error("synthetic sync exception")),
        },
      });
      for (const adapter of baseRegistry.list()) {
        if (adapter.id !== "blog") registry.register(adapter);
      }

      const result = await executePosts(context, { sync: true }, { registry });
      expect(result.sync).toMatchObject({ action: "failed" });
      expect(result.sync?.message).toContain("synthetic sync exception");
      expect(result.sources).toHaveLength(2);
      expect(context.getStore().sources.list("blog")).toHaveLength(2);
    } finally {
      context.close();
    }
  });

  it("把原稿标题空白压平，并将草稿标记纳入 40 列上限", () => {
    const title = ` 标题\n\t${"汉".repeat(40)}`;
    const normalized = `标题 ${"汉".repeat(40)}`;
    const displayedTitle = `${truncateByWidth(normalized, 32)}（草稿）`;
    const source: PostsSourceResult = {
      ref: "zh/title",
      title,
      origin: "repo",
      draft: true,
      targets: [],
    };
    const output = renderPosts({ sources: [source], issues: [] });
    expect(output).toContain(displayedTitle);
    expect(displayedTitle.endsWith("…（草稿）")).toBe(true);
    expect(displayWidth(displayedTitle)).toBeLessThanOrEqual(40);
    expect(output).not.toContain("\t");
    expect(output.split("\n")).toHaveLength(3);
  });

  it("渲染进行中、发布中、待核实和多条已发布回答状态", () => {
    const target = (
      format: string,
      state: PostsTargetResult["state"],
      count = 0,
    ): PostsTargetResult => ({
      platform: "zhihu",
      format,
      label: format === "article" ? "知乎·长文" : "知乎·回答",
      state,
      count,
      urls: [],
    });
    const statuses: readonly [
      PostsTargetResult["state"],
      PostsTargetResult["state"],
      number?,
    ][] = [
      ["none", "none"],
      ["pending", "none"],
      ["unverified", "none"],
      ["in-progress", "none"],
      ["none", "published", 2],
    ];
    const sources = statuses.map(
      ([articleState, answerState, count], index) => ({
        ref: `zh/status-${index}`,
        title: `状态 ${index}`,
        origin: "repo" as const,
        draft: false,
        targets: [
          target("article", articleState),
          target("answer", answerState, count),
        ],
      }),
    );
    const output = renderPosts({ sources, issues: [] });
    for (const state of ["进行中", "发布中", "待核实", "已发 2"]) {
      expect(output).toContain(state);
    }
    expect(output).toContain("知乎·回答 已发 1 篇");
  });

  it("任一原稿入库失败时回滚整批原稿事务", async () => {
    const { context } = await setup();
    const store = context.getStore();
    const upsertSource = store.sources.upsert.bind(store.sources);
    let upsertCount = 0;
    const failingStore: Store = {
      ...store,
      sources: {
        ...store.sources,
        upsert(input) {
          upsertCount += 1;
          if (upsertCount === 2) throw new Error("synthetic upsert failure");
          return upsertSource(input);
        },
      },
    };
    try {
      await expect(
        executePosts(context, {}, { store: failingStore }),
      ).rejects.toThrow("synthetic upsert failure");
      expect(upsertCount).toBe(2);
      expect(store.sources.list("blog")).toEqual([]);
    } finally {
      context.close();
    }
  });

  it("重复执行不会重复入库，并聚合一篇原稿的多个回答目标", async () => {
    const { context } = await setup();
    try {
      const first = await executePosts(context, { locale: "all" });
      const sourceId = context
        .getStore()
        .sources.getByRef("blog", "zh/newest")?.id;
      expect(sourceId).toBeDefined();
      for (const targetKey of ["question-1", "question-2"]) {
        const variant = context.getStore().variants.create({
          sourceId: sourceId ?? "",
          platform: "zhihu",
          format: "answer",
          targetKey,
        });
        context.getStore().publications.recordManual({
          variantId: variant.id,
          url: `https://zhihu.test/${targetKey}`,
        });
      }

      const second = await executePosts(context, { locale: "all" });
      expect(context.getStore().sources.list("blog")).toHaveLength(3);
      expect(first.sources).toHaveLength(3);
      const source = second.sources.find((item) => item.ref === "zh/newest");
      expect(
        source?.targets.find((target) => target.format === "answer"),
      ).toMatchObject({
        state: "published",
        count: 2,
        urls: [
          "https://zhihu.test/question-1",
          "https://zhihu.test/question-2",
        ],
      });
    } finally {
      context.close();
    }
  });

  it("拒绝非正整数 limit", async () => {
    const { context } = await setup();
    try {
      await expect(executePosts(context, { limit: "0" })).rejects.toMatchObject(
        {
          code: "USAGE",
        },
      );
    } finally {
      context.close();
    }
  });
});
