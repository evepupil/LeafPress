import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { withBlogRepoLock } from "../../../src/platforms/blog/lock.js";
import { publishBlogDraft } from "../../../src/platforms/blog/steps/publish.js";
import { execCommand } from "../../../src/shared/exec.js";
import {
  EN_PATH,
  HASH_MISMATCH,
  IMAGE_PATH,
  ZH_PATH,
  commitInfo,
  gitSubcommands,
  publish,
  pushCalls,
  readPublished,
  remoteGit,
  withFixture,
} from "./publish-support.js";
import { stubCleanSshEnv } from "./git-env-support.js";
import {
  ACCOUNT_ID,
  type BlogFixture,
  NOW_ISO,
  SLUG,
  draftText,
  exists,
  readTaskFile,
  timeout,
  writeGate,
} from "./steps-fixtures.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("博客 publish 步骤：检查凭据", () => {
  const cases: [string, (fixture: BlogFixture) => Promise<void>][] = [
    ["没有 .gate.json", async () => {}],
    [
      "检查指纹对不上",
      (fixture) => writeGate(fixture, { hash: "0".repeat(64) }).then(() => {}),
    ],
    [
      "检查时的 slug 和现在的不一样",
      (fixture) => writeGate(fixture, { slug: "other-slug" }).then(() => {}),
    ],
    [
      "凭据里 passed 不是 true",
      async (fixture) => {
        const record = await writeGate(fixture);
        await writeFile(
          join(fixture.folder, ".gate.json"),
          JSON.stringify({ ...record, passed: false }),
          "utf8",
        );
      },
    ],
    [
      "检查之后又改了中文稿",
      async (fixture) => {
        await writeGate(fixture);
        await writeFile(
          join(fixture.folder, "中文稿.mdx"),
          draftText({ title: "检查之后改的", locale: "zh-CN" }),
          "utf8",
        );
      },
    ],
    [
      "检查之后改了 slug.txt",
      async (fixture) => {
        await writeGate(fixture);
        await writeFile(join(fixture.folder, "slug.txt"), "changed-slug\n");
      },
    ],
    [
      "检查之后换了图片",
      async (fixture) => {
        await writeGate(fixture);
        await writeFile(
          join(fixture.folder, "images", "cover.png"),
          Buffer.from([9, 9]),
        );
      },
    ],
  ];

  it.each(cases)(
    "%s → 要求退回重新检查，不碰仓库",
    async (_name, prepare) => {
      await withFixture(
        async (fixture) => {
          await prepare(fixture);
          const before = await fixture.remoteHead();

          const outcome = await publish(fixture, false);

          expect(outcome).toEqual({ kind: "fail", error: HASH_MISMATCH });
          expect(fixture.gitCalls).toEqual([]);
          expect(fixture.pnpm.calls).toEqual([]);
          expect(await exists(fixture.checkoutDir)).toBe(false);
          expect(await fixture.remoteHead()).toBe(before);
        },
        { withImages: true },
      );
    },
    30_000,
  );

  it("上一轮的 .publish.json 在开始时作废", async () => {
    await withFixture(async (fixture) => {
      await writeFile(join(fixture.folder, ".publish.json"), "{}", "utf8");

      await publish(fixture, false);

      expect(await exists(join(fixture.folder, ".publish.json"))).toBe(false);
    });
  }, 30_000);
});

describe("博客 publish 步骤：正常推送", () => {
  it("只提交目标路径、推到线上 main，写 .publish.json；作者工作区不动", async () => {
    await withFixture(
      async (fixture) => {
        // 屏蔽本机的 ssh 设置，才能精确断言缺省值
        stubCleanSshEnv(fixture.base);
        const before = await fixture.remoteHead();

        const outcome = await publish(fixture);

        const head = await fixture.remoteHead();
        expect(outcome).toEqual({
          kind: "done",
          note: `已推送（提交 ${head.slice(0, 7)}）`,
        });
        expect(head).not.toBe(before);
        const info = await commitInfo(fixture, head);
        expect(info.parents).toEqual([before]);
        expect(info.files).toEqual([EN_PATH, IMAGE_PATH, ZH_PATH].sort());
        expect(info.subject).toBe("post: 测试文章");
        // 用作者仓库的 git 配置做提交人
        expect(info.author).toBe("Test Author");
        // 推上去的就是任务文件夹里的稿子
        expect(await remoteGit(fixture, ["show", `${head}:${ZH_PATH}`])).toBe(
          (await readTaskFile(fixture, "中文稿.mdx")).trim(),
        );

        expect(await readPublished(fixture)).toEqual({
          slug: SLUG,
          commit: head,
          pushedAt: NOW_ISO,
        });
        expect(fixture.pnpm.calls.map((call) => call.script)).toEqual([
          "install",
          "content:check",
        ]);
        const [push] = pushCalls(fixture);
        expect(push?.args).toEqual(["push", "origin", "HEAD:main"]);
        expect(push?.options?.timeoutMs).toBe(120_000);
        expect(push?.options?.env?.["GIT_TERMINAL_PROMPT"]).toBe("0");
        expect(push?.options?.env?.["GIT_SSH_COMMAND"]).toBe(
          "ssh -o BatchMode=yes",
        );
        expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
      },
      { withImages: true },
    );
  }, 90_000);

  it("没有图片：只提交两篇稿子", async () => {
    await withFixture(async (fixture) => {
      const outcome = await publish(fixture);

      expect(outcome.kind).toBe("done");
      const info = await commitInfo(fixture, await fixture.remoteHead());
      expect(info.files).toEqual([EN_PATH, ZH_PATH].sort());
    });
  }, 90_000);

  it("提交只含目标路径：检出目录里别的已暂存文件不会被带上", async () => {
    await withFixture(async (fixture) => {
      fixture.setInterceptor(async (call, real) => {
        const cwd = call.options?.cwd;
        if (call.args[0] === "add" && cwd !== undefined) {
          await writeFile(join(cwd, "staged-junk.txt"), "不该进提交", "utf8");
          await execCommand("git", ["add", "staged-junk.txt"], { cwd });
        }
        return real();
      });

      expect((await publish(fixture)).kind).toBe("done");

      const info = await commitInfo(fixture, await fixture.remoteHead());
      expect(info.files).toEqual([EN_PATH, ZH_PATH].sort());
    });
  }, 90_000);

  it("content:check 没过：不提交不推送，不写 .publish.json", async () => {
    await withFixture(async (fixture) => {
      fixture.pnpm.fail("content:check", "frontmatter 的 tags 不能为空");
      const before = await fixture.remoteHead();

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "博客 content:check 没过：frontmatter 的 tags 不能为空",
      });
      expect(await fixture.remoteHead()).toBe(before);
      expect(gitSubcommands(fixture, "commit")).toEqual([]);
      expect(pushCalls(fixture)).toEqual([]);
      expect(await exists(join(fixture.folder, ".publish.json"))).toBe(false);
      expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
    });
  }, 90_000);

  it("content:check 超时：失败并说明", async () => {
    await withFixture(async (fixture) => {
      fixture.pnpm.on("content:check", () => timeout());

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "博客 content:check 没过：超过 2 分钟没跑完，已结束",
      });
    });
  }, 90_000);
});

describe("博客 publish 步骤：其他", () => {
  it("博客仓库锁被占着：立即失败，不碰检出目录", async () => {
    await withFixture(async (fixture) => {
      await writeGate(fixture);

      const outcome = await withBlogRepoLock({
        home: fixture.home,
        accountId: ACCOUNT_ID,
        workId: "b-9",
        step: "跑博客检查",
        run: () => publishBlogDraft(fixture.ctx),
      });

      expect(outcome.kind).toBe("fail");
      if (outcome.kind === "fail")
        expect(outcome.error).toMatch(
          /^博客仓库正在被另一次「跑博客检查」使用/,
        );
      expect(fixture.gitCalls).toEqual([]);
      expect(await exists(fixture.checkoutDir)).toBe(false);
    });
  }, 60_000);

  it("仓库位置没配：直接失败", async () => {
    await withFixture(
      async (fixture) => {
        expect(await publish(fixture)).toEqual({
          kind: "fail",
          error: "博客仓库位置还没配",
        });
      },
      { settings: { "repo-path": undefined } },
    );
  }, 30_000);
});
