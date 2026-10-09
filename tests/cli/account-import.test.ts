import type { ImportSummary, UseCases, Work } from "@leafpress/core";
import { describe, expect, it, vi } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import {
  renderAccountImport,
  run,
  slimImportSummary,
} from "../../src/cli/commands/account-import.js";

function cast<T>(value: unknown): T {
  return value as T;
}

function fakeUseCases(value: object): UseCases {
  return cast<UseCases>(value);
}

function capture(run: () => Promise<void>): Promise<{ stdout: string }> {
  const original = process.stdout.write.bind(process.stdout);
  let stdout = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  return run().then(
    () => {
      process.stdout.write = original;
      return { stdout };
    },
    (error: unknown) => {
      process.stdout.write = original;
      throw error;
    },
  );
}

const work = cast<Work>({
  id: "b-1",
  accountId: "blog-1",
  title: "第一篇",
  status: "done",
  step: 1,
  workflowId: "blog-write",
  url: "https://blog.example.test/a",
  publishedAt: "2026-09-20",
});

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    added: 2,
    skipped: 1,
    drafts: 0,
    issues: [],
    works: [work],
    ...overrides,
  };
}

describe("leafpress account import", () => {
  it("只有新增时输出一行，JSON 里作品只留 id、标题、链接、发布日期", () => {
    const result = summary({ skipped: 0 });
    expect(renderAccountImport(result).split("\n")).toEqual([
      "导入 2 篇，0 篇已经有了",
    ]);
    expect(slimImportSummary(result)).toEqual({
      added: 2,
      skipped: 0,
      drafts: 0,
      issues: [],
      works: [
        {
          id: "b-1",
          title: "第一篇",
          url: "https://blog.example.test/a",
          publishedAt: "2026-09-20",
        },
      ],
    });
  });

  it("有草稿和读不了的原稿时各占一行，每篇读不了的原稿再一行", () => {
    const result = summary({
      added: 1,
      skipped: 2,
      drafts: 1,
      issues: [{ path: "content/posts/zh/bad.mdx", message: "没有标题" }],
    });
    expect(renderAccountImport(result).split("\n")).toEqual([
      "导入 1 篇，2 篇已经有了",
      "跳过 1 篇草稿，1 篇读不了",
      "content/posts/zh/bad.mdx：没有标题",
    ]);
  });

  it("全都已经有了时不写草稿和读不了那一行", () => {
    const result = summary({ added: 0, skipped: 3 });
    expect(renderAccountImport(result).split("\n")).toEqual([
      "导入 0 篇，3 篇已经有了",
    ]);
  });

  it("run 把账号编号交给用例，成功时输出结果", async () => {
    const importPosts = vi.fn().mockResolvedValue(summary());
    const context = createCliContext(
      {},
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases({ importPosts }),
      },
    );
    const output = await capture(() => run(context, ["blog-1"]));
    expect(importPosts).toHaveBeenCalledWith("blog-1");
    expect(output.stdout.split("\n")).toEqual(["导入 2 篇，1 篇已经有了", ""]);
  });

  it("run 在 JSON 模式下输出瘦身后的结果", async () => {
    const context = createCliContext(
      { json: true },
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases({
          importPosts: vi.fn(() => Promise.resolve(summary())),
        }),
      },
    );
    const output = await capture(() => run(context, ["blog-1"]));
    expect(JSON.parse(output.stdout)).toEqual({
      ok: true,
      summary: {
        added: 2,
        skipped: 1,
        drafts: 0,
        issues: [],
        works: [
          {
            id: "b-1",
            title: "第一篇",
            url: "https://blog.example.test/a",
            publishedAt: "2026-09-20",
          },
        ],
      },
    });
  });

  it("缺账号编号时报用法错误", async () => {
    const context = createCliContext(
      {},
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases({ importPosts: vi.fn() }),
      },
    );
    await expect(run(context, [])).rejects.toMatchObject({
      code: "USAGE",
      message: "缺少账号编号。",
    });
  });
});
