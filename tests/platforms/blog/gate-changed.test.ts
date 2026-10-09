/**
 * 检查期间稿子被改了：这次检查必须判失败。
 *
 * 构建要跑好几分钟（作者博客实测 241 秒），这期间任务文件夹里的稿子可能被人改了。
 * 原来 .gate.json 记的是检查结束时任务文件夹里的稿子，状态却是通过；之后推送只重跑内容检查就推上线，
 * 格式检查和构建从没见过这一版。
 */
import { readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hashDraft,
  loadDraft,
} from "../../../src/platforms/blog/steps/draft.js";
import {
  CHANGED_DURING_CHECK,
  gateBlogDraft,
} from "../../../src/platforms/blog/steps/gate.js";
import { hashCopiedDraft } from "../../../src/platforms/blog/steps/post-files.js";
import {
  type BlogFixture,
  SLUG,
  draftText,
  exists,
  failure,
  formatted,
  makeBlogFixture,
  ok,
  readTaskFile,
} from "./steps-fixtures.js";

const CHANGED_ZH = draftText({ title: "构建期间改的标题", locale: "zh-CN" });

async function withFixture(
  run: (fixture: BlogFixture) => Promise<void>,
): Promise<void> {
  const fixture = await makeBlogFixture({ withImages: true });
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

/** 到了某一步就让「有人」改一下任务文件夹里的稿子，改完这一步照常成功 */
function changeDuring(
  fixture: BlogFixture,
  script: string,
  change: () => Promise<void>,
): void {
  fixture.pnpm.on(script, async () => {
    await change();
    return ok();
  });
}

const changedMessage = { kind: "fail", error: CHANGED_DURING_CHECK } as const;

describe("博客 gate 步骤：检查期间稿子被改过", () => {
  it("构建那一步有人改了中文稿：判失败，不写 .gate.json，改过的稿子原样保留（不被排好版的覆盖回去）", async () => {
    await withFixture(async (fixture) => {
      changeDuring(fixture, "build", () =>
        writeFile(join(fixture.folder, "中文稿.mdx"), CHANGED_ZH, "utf8"),
      );

      const outcome = await gateBlogDraft(fixture.ctx);

      // 原因就是这一句，让 agent 知道重新跑检查就行
      expect(outcome).toEqual(changedMessage);
      expect(CHANGED_DURING_CHECK).toBe("稿子在检查期间改过，重新跑检查");
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
      // 改过的内容一个字都没丢：既没被排好版的稿子覆盖，也没被排好版
      expect(await readTaskFile(fixture, "中文稿.mdx")).toBe(CHANGED_ZH);
      // 英文稿也没被拷回去（排版会去掉行尾空格，拷回去就变了）
      expect(await readTaskFile(fixture, "英文稿.mdx")).toBe(
        draftText({ title: "Test Article", locale: "en", body: "Body.  " }),
      );
      // 不留下一份看着像「全过」的检查结果
      expect(await exists(join(fixture.folder, "检查结果.txt"))).toBe(false);
      // 锁照常释放
      expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
    });
  }, 90_000);

  it.each<[string, string, (fixture: BlogFixture) => Promise<void>]>([
    [
      "有人改了英文稿",
      "format:check",
      (fixture) =>
        writeFile(
          join(fixture.folder, "英文稿.mdx"),
          draftText({ title: "Changed During Check", locale: "en" }),
          "utf8",
        ),
    ],
    [
      "有人改了 slug.txt",
      "content:check",
      (fixture) =>
        writeFile(join(fixture.folder, "slug.txt"), "other-slug\n", "utf8"),
    ],
    [
      "有人改了图片内容",
      "format:check",
      (fixture) =>
        writeFile(
          join(fixture.folder, "images", "cover.png"),
          Buffer.from([9, 9, 9]),
        ),
    ],
    [
      "有人新增了一张图片",
      "build",
      (fixture) =>
        writeFile(
          join(fixture.folder, "images", "extra.png"),
          Buffer.from([4]),
        ),
    ],
    [
      "有人删掉了一张图片",
      "build",
      (fixture) => rm(join(fixture.folder, "images", "cover.png")),
    ],
    [
      "有人改了中文稿",
      "prettier",
      (fixture) =>
        writeFile(join(fixture.folder, "中文稿.mdx"), CHANGED_ZH, "utf8"),
    ],
  ])(
    "%s（在 %s 那一步）：同样判失败，不写 .gate.json",
    async (_name, script, change) => {
      await withFixture(async (fixture) => {
        changeDuring(fixture, script, () => change(fixture));

        const outcome = await gateBlogDraft(fixture.ctx);

        expect(outcome).toEqual(changedMessage);
        expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
      });
    },
    90_000,
  );

  it("读出稿子之后、复制进检出目录之前（拿锁、同步线上期间）图片被删了：同样判失败，不是裸的 ENOENT", async () => {
    await withFixture(async (fixture) => {
      let removed = false;
      fixture.setInterceptor(async (call, real) => {
        if (call.args.includes("fetch") && !removed) {
          removed = true;
          await rm(join(fixture.folder, "images", "cover.png"));
        }
        return real();
      });

      const outcome = await gateBlogDraft(fixture.ctx);

      expect(outcome).toEqual(changedMessage);
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
      expect(fixture.pnpm.callsOf("content:check")).toEqual([]);
    });
  }, 90_000);

  it("某一项没过、同时稿子也改了：以「稿子改过」为准（那项的结果说的是旧版本）", async () => {
    await withFixture(async (fixture) => {
      fixture.pnpm.on("build", async () => {
        await writeFile(join(fixture.folder, "中文稿.mdx"), CHANGED_ZH, "utf8");
        return failure("构建炸了");
      });

      const outcome = await gateBlogDraft(fixture.ctx);

      expect(outcome).toEqual(changedMessage);
      expect(await readTaskFile(fixture, "中文稿.mdx")).toBe(CHANGED_ZH);
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
    });
  }, 90_000);

  it("上一轮全过留下的 .gate.json，在这一轮因为稿子被改而失败时不会还留着", async () => {
    await withFixture(async (fixture) => {
      expect((await gateBlogDraft(fixture.ctx)).kind).toBe("done");
      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(true);
      changeDuring(fixture, "build", () =>
        writeFile(join(fixture.folder, "中文稿.mdx"), CHANGED_ZH, "utf8"),
      );

      expect(await gateBlogDraft(fixture.ctx)).toEqual(changedMessage);

      expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
    });
  }, 120_000);

  it("按提示重新跑检查：这次没人动稿子，就能过，.gate.json 记的是改过之后排好版的那一份", async () => {
    await withFixture(async (fixture) => {
      let edits = 0;
      fixture.pnpm.on("build", async () => {
        edits += 1;
        if (edits === 1)
          await writeFile(
            join(fixture.folder, "中文稿.mdx"),
            CHANGED_ZH,
            "utf8",
          );
        return ok();
      });
      expect(await gateBlogDraft(fixture.ctx)).toEqual(changedMessage);

      const second = await gateBlogDraft(fixture.ctx);

      expect(second).toEqual({ kind: "done", note: "博客检查全过" });
      // 排好版的稿子这次才拷回去
      expect(await readTaskFile(fixture, "中文稿.mdx")).toBe(
        formatted(CHANGED_ZH),
      );
      const record = JSON.parse(await readTaskFile(fixture, ".gate.json")) as {
        hash: string;
        slug: string;
      };
      expect(record.slug).toBe(SLUG);
      expect(record.hash).toBe(
        await hashDraft(await loadDraft(fixture.folder)),
      );
    });
  }, 120_000);

  it(".gate.json 的指纹就是排好版之后的那份：等于检出目录里检查过的复制品的指纹", async () => {
    await withFixture(async (fixture) => {
      expect((await gateBlogDraft(fixture.ctx)).kind).toBe("done");

      const record = JSON.parse(await readTaskFile(fixture, ".gate.json")) as {
        hash: string;
      };
      const draft = await loadDraft(fixture.folder);
      // 检出目录里是三项检查实际跑过的那一版（已排版），任务文件夹里拷回去的是同一份
      expect(record.hash).toBe(
        await hashCopiedDraft(fixture.checkoutDir, draft),
      );
      expect(record.hash).toBe(await hashDraft(draft));
    });
  }, 90_000);
});
