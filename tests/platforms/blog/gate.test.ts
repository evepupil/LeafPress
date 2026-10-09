import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { withBlogRepoLock } from "../../../src/platforms/blog/lock.js";
import {
  hashDraft,
  loadDraft,
} from "../../../src/platforms/blog/steps/draft.js";
import { gateBlogDraft } from "../../../src/platforms/blog/steps/gate.js";
import {
  type BlogFixture,
  ACCOUNT_ID,
  NOW_ISO,
  SLUG,
  draftText,
  exists,
  formatted,
  makeBlogFixture,
  readTaskFile,
  timeout,
} from "./steps-fixtures.js";

type Fixture = BlogFixture;

function normalized(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

/** 跑 gate，并证明作者工作区在整个过程中一个字节没动 */
async function runGate(fixture: Fixture) {
  const before = await fixture.snapshotAuthor();
  const outcome = await gateBlogDraft(fixture.ctx);
  expect(await fixture.snapshotAuthor()).toEqual(before);
  return outcome;
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  options: Parameters<typeof makeBlogFixture>[0] = {},
): Promise<void> {
  const fixture = await makeBlogFixture(options);
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

async function readGate(fixture: Fixture): Promise<Record<string, unknown>> {
  return JSON.parse(await readTaskFile(fixture, ".gate.json")) as Record<
    string,
    unknown
  >;
}

describe("博客 gate 步骤：检查在 LeafPress 自己的检出目录里做", () => {
  it("三项全过：排好版的稿子复制回来，写检查结果和 .gate.json，作者工作区不动", async () => {
    await withFixture(
      async (fixture) => {
        const outcome = await runGate(fixture);

        expect(outcome).toEqual({ kind: "done", note: "博客检查全过" });

        // 命令只在检出目录里跑，按顺序：装依赖、排版、三项检查
        expect(fixture.pnpm.calls.map((call) => call.script)).toEqual([
          "install",
          "prettier",
          "content:check",
          "format:check",
          "build",
        ]);
        for (const call of fixture.pnpm.calls) {
          expect(normalized(call.cwd)).toBe(normalized(fixture.checkoutDir));
          expect(call.killTree).toBe(true);
        }
        expect(fixture.pnpm.callsOf("prettier")[0]?.args).toEqual([
          "exec",
          "prettier",
          "--write",
          "content/posts/zh/test-article.mdx",
          "content/posts/en/test-article.mdx",
        ]);
        expect(
          ["content:check", "format:check", "build"].map(
            (script) => fixture.pnpm.callsOf(script)[0]?.timeoutMs,
          ),
        ).toEqual([2 * 60_000, 3 * 60_000, 8 * 60_000]);

        // 排好版的稿子回到任务文件夹
        expect(await readTaskFile(fixture, "中文稿.mdx")).toBe(
          formatted(draftText({ title: "测试文章", locale: "zh-CN" })),
        );
        expect(await readTaskFile(fixture, "英文稿.mdx")).toBe(
          formatted(
            draftText({ title: "Test Article", locale: "en", body: "Body." }),
          ),
        );

        // 检查结果.txt
        const report = await readTaskFile(fixture, "检查结果.txt");
        expect(report.split("\n")[0]).toBe("博客检查：全过");
        for (const name of [
          "prettier 排版",
          "content:check",
          "format:check",
          "build",
        ]) {
          expect(report).toMatch(new RegExp(`${name}：通过（\\d+\\.\\d 秒）`));
        }

        // .gate.json
        const gate = await readGate(fixture);
        expect(gate).toEqual({
          passed: true,
          slug: SLUG,
          hash: await hashDraft(await loadDraft(fixture.folder)),
          base: await fixture.remoteHead(),
          checkedAt: NOW_ISO,
        });

        // 稿子和图片放进了检出目录；检查完不用还原，作者仓库里没有这些
        expect(
          await readFile(
            join(fixture.checkoutDir, "content/posts/zh/test-article.mdx"),
            "utf8",
          ),
        ).toBe(await readTaskFile(fixture, "中文稿.mdx"));
        expect(
          await exists(
            join(
              fixture.checkoutDir,
              "public/images/posts/test-article/cover.png",
            ),
          ),
        ).toBe(true);
        expect(
          await exists(join(fixture.repo, "content/posts/zh/test-article.mdx")),
        ).toBe(false);

        // 锁释放了，检查期间一直在续租约
        expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
        expect(fixture.heartbeats).toBeGreaterThanOrEqual(5);
      },
      { withImages: true },
    );
  }, 90_000);

  it.each([
    ["content:check", ["content:check"]],
    ["format:check", ["content:check", "format:check"]],
    ["build", ["content:check", "format:check", "build"]],
  ])(
    "%s 没过：后面的不再跑，结果里附最后 80 行输出，不写 .gate.json",
    async (failing, expectedRuns) => {
      await withFixture(async (fixture) => {
        const output = Array.from(
          { length: 100 },
          (_, index) => `line-${index + 1}`,
        ).join("\n");
        fixture.pnpm.fail(failing, output);

        const outcome = await runGate(fixture);

        expect(outcome).toEqual({
          kind: "fail",
          error: `博客检查没过：${failing}（详情在 检查结果.txt）`,
        });
        expect(
          fixture.pnpm.calls
            .map((call) => call.script)
            .filter((script) => script !== "install" && script !== "prettier"),
        ).toEqual(expectedRuns);
        const report = await readTaskFile(fixture, "检查结果.txt");
        expect(report.split("\n")[0]).toBe("博客检查：没过");
        expect(report).toContain(`${failing}：没过（`);
        expect(report).toContain(`${failing} 最后 80 行输出：`);
        expect(report).toContain("line-21\n");
        expect(report).toContain("line-100");
        expect(report).not.toContain("line-20\n");
        expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
        // 前面排好的版已经回到任务文件夹，agent 接着改这份
        expect(await readTaskFile(fixture, "中文稿.mdx")).toBe(
          formatted(draftText({ title: "测试文章", locale: "zh-CN" })),
        );
        expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
      });
    },
    90_000,
  );

  it("排版（prettier）没过：不跑三项检查，稿子保持原样", async () => {
    await withFixture(async (fixture) => {
      fixture.pnpm.fail("prettier", "SyntaxError: 第 3 行的标签没关");
      const original = await readTaskFile(fixture, "中文稿.mdx");

      const outcome = await runGate(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "博客检查没过：prettier 排版（详情在 检查结果.txt）",
      });
      expect(
        fixture.pnpm.calls
          .map((call) => call.script)
          .filter((s) => s !== "install"),
      ).toEqual(["prettier"]);
      expect(await readTaskFile(fixture, "检查结果.txt")).toContain(
        "SyntaxError: 第 3 行的标签没关",
      );
      expect(await readTaskFile(fixture, "中文稿.mdx")).toBe(original);
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
    });
  }, 90_000);

  it("超时：按没过处理，结果里写明超过几分钟", async () => {
    await withFixture(async (fixture) => {
      fixture.pnpm.on("build", () => timeout());

      const outcome = await runGate(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "博客检查没过：build（详情在 检查结果.txt）",
      });
      expect(await readTaskFile(fixture, "检查结果.txt")).toContain(
        "超过 8 分钟没跑完，已结束",
      );
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
    });
  }, 90_000);

  it("检查命令里出现密钥和带口令的网址：结果里都抹掉", async () => {
    await withFixture(async (fixture) => {
      fixture.pnpm.fail(
        "build",
        "连接 https://user:hunter2@example.test/x 时带着 umami-secret-token-123 失败",
      );
      const ctx = {
        ...fixture.ctx,
        secret: (key: string) =>
          key === "umami-share" ? "umami-secret-token-123" : undefined,
      };

      const outcome = await gateBlogDraft(ctx);

      expect(outcome.kind).toBe("fail");
      const report = await readTaskFile(fixture, "检查结果.txt");
      expect(report).toContain("<redacted>");
      expect(report).not.toContain("umami-secret-token-123");
      expect(report).not.toContain("hunter2");
    });
  }, 90_000);

  it("稿子有问题：直接失败，不碰仓库、不拿锁，上一轮的检查凭据和报告作废", async () => {
    await withFixture(async (fixture) => {
      await writeFile(join(fixture.folder, ".gate.json"), "{}", "utf8");
      await writeFile(join(fixture.folder, "检查结果.txt"), "上一轮\n", "utf8");
      await writeFile(
        join(fixture.folder, "中文稿.mdx"),
        draftText({ title: "测试文章", locale: "zh-CN" }).replace(
          "draft: false",
          "draft: true",
        ),
        "utf8",
      );

      const outcome = await runGate(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "稿子写了 draft: true，博客不会显示，改成 false（中文稿.mdx）",
      });
      expect(fixture.gitCalls).toEqual([]);
      expect(fixture.pnpm.calls).toEqual([]);
      expect(await exists(fixture.checkoutDir)).toBe(false);
      expect(await exists(join(fixture.home, "locks"))).toBe(false);
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
      expect(await exists(join(fixture.folder, "检查结果.txt"))).toBe(false);
    });
  }, 60_000);

  it("仓库位置或站点地址没配：直接失败并说清缺哪个", async () => {
    await withFixture(
      async (fixture) => {
        expect(await runGate(fixture)).toEqual({
          kind: "fail",
          error: "博客仓库位置还没配",
        });
        expect(fixture.gitCalls).toEqual([]);
      },
      { settings: { "repo-path": undefined } },
    );
    await withFixture(
      async (fixture) => {
        expect(await runGate(fixture)).toEqual({
          kind: "fail",
          error: "站点地址还没配",
        });
        expect(fixture.gitCalls).toEqual([]);
      },
      { settings: { "site-url": "  " } },
    );
  }, 60_000);

  describe("撞车检查（看的是线上最新的 main，不是作者本地）", () => {
    it.each([
      [
        "同名 .md",
        { "content/posts/zh/test-article.md": "别人的\n" },
        "content/posts/zh/test-article.md",
      ],
      [
        "同名 .mdx（英文目录）",
        { "content/posts/en/test-article.mdx": "other\n" },
        "content/posts/en/test-article.mdx",
      ],
      [
        "图片文件夹已存在",
        { "public/images/posts/test-article/old.png": "旧图" },
        "public/images/posts/test-article/",
      ],
    ])(
      "%s → 失败并说清撞了哪个路径，不写 .gate.json",
      async (_name, onlineFiles, collidingPath) => {
        await withFixture(async (fixture) => {
          await fixture.pushFromElsewhere(onlineFiles, "线上已有");

          const outcome = await runGate(fixture);

          expect(outcome).toEqual({
            kind: "fail",
            error: `slug 撞了已有文章：${collidingPath}，改 slug.txt 里的 slug 再跑`,
          });
          expect(fixture.pnpm.calls.map((call) => call.script)).toEqual([
            "install",
          ]);
          expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
          expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
        });
      },
      60_000,
    );

    // 译文配对键撞车的提示单独一份，见 gate-collision.test.ts

    it("作者本地有同名文件但线上没有：不算撞车", async () => {
      await withFixture(async (fixture) => {
        await mkdir(join(fixture.repo, "content/posts/zh"), {
          recursive: true,
        });
        await writeFile(
          join(fixture.repo, "content/posts/zh/test-article.mdx"),
          "作者本地没提交的草稿\n",
          "utf8",
        );

        expect(await runGate(fixture)).toEqual({
          kind: "done",
          note: "博客检查全过",
        });
        expect(
          await readFile(
            join(fixture.repo, "content/posts/zh/test-article.mdx"),
            "utf8",
          ),
        ).toBe("作者本地没提交的草稿\n");
      });
    }, 60_000);
  });

  it("重复运行：不会撞上上一次留在检出目录里的自己", async () => {
    await withFixture(async (fixture) => {
      expect((await runGate(fixture)).kind).toBe("done");
      const first = await readGate(fixture);

      const second = await runGate(fixture);

      expect(second).toEqual({ kind: "done", note: "博客检查全过" });
      expect(await readGate(fixture)).toEqual(first);
      expect(fixture.pnpm.callsOf("install")).toHaveLength(1);
    });
  }, 90_000);

  it("博客仓库锁被另一次使用占着：立即失败，不碰检出目录", async () => {
    await withFixture(async (fixture) => {
      const outcome = await withBlogRepoLock({
        home: fixture.home,
        accountId: ACCOUNT_ID,
        workId: "b-9",
        step: "导入文章",
        run: () => runGate(fixture),
      });

      expect(outcome.kind).toBe("fail");
      if (outcome.kind === "fail") {
        expect(outcome.error).toMatch(
          /^博客仓库正在被另一次「导入文章」使用（作品 b-9，\d{2}:\d{2} 开始），等它跑完再试$/,
        );
      }
      expect(fixture.pnpm.calls).toEqual([]);
      expect(fixture.gitCalls).toEqual([]);
      expect(await exists(fixture.checkoutDir)).toBe(false);
    });
  }, 60_000);

  it("拿不到线上（fetch 失败）：失败并释放锁", async () => {
    await withFixture(async (fixture) => {
      await fixture.git([
        "remote",
        "set-url",
        "origin",
        join(fixture.base, "不存在的远程"),
      ]);

      const outcome = await runGate(fixture);

      expect(outcome.kind).toBe("fail");
      if (outcome.kind === "fail")
        expect(outcome.error).toMatch(/^博客仓库 fetch 失败/);
      expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
    });
  }, 60_000);
});
