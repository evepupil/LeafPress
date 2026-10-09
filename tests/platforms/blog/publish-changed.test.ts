/**
 * publish 开头会核对一次检查凭据，但那之后还要拿锁、同步线上、装依赖，可能过了好几分钟，
 * 稿子随时可能被改。所以稿子复制进检出目录之后要再核对一次：
 * 提交的必须就是检查过的那一版，不然格式检查和构建从没见过它。
 */
import { readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HASH_MISMATCH,
  gitSubcommands,
  publish,
  pushCalls,
  withFixture,
} from "./publish-support.js";
import { type BlogFixture, draftText, exists } from "./steps-fixtures.js";

/** 到「同步线上」（git fetch）的时候，有人改了任务文件夹里的稿子 */
function changeWhileSyncing(
  fixture: BlogFixture,
  change: () => Promise<void>,
): void {
  let changed = false;
  fixture.setInterceptor(async (call, real) => {
    if (call.args.includes("fetch") && !changed) {
      changed = true;
      await change();
    }
    return real();
  });
}

describe("博客 publish 步骤：复制进检出目录后再核对一次", () => {
  it.each<[string, (fixture: BlogFixture) => Promise<void>]>([
    [
      "中文稿",
      (fixture) =>
        writeFile(
          join(fixture.folder, "中文稿.mdx"),
          draftText({ title: "核对之后才改的标题", locale: "zh-CN" }),
          "utf8",
        ),
    ],
    [
      "英文稿",
      (fixture) =>
        writeFile(
          join(fixture.folder, "英文稿.mdx"),
          draftText({ title: "Changed Later", locale: "en" }),
          "utf8",
        ),
    ],
    [
      "图片",
      (fixture) =>
        writeFile(
          join(fixture.folder, "images", "cover.png"),
          Buffer.from([7, 7]),
        ),
    ],
    [
      "slug.txt",
      (fixture) =>
        writeFile(join(fixture.folder, "slug.txt"), "another-slug\n", "utf8"),
    ],
  ])(
    "开头核对通过之后、同步线上期间被改了%s：失败并要求重新检查，不提交不推送",
    async (_name, change) => {
      await withFixture(
        async (fixture) => {
          changeWhileSyncing(fixture, () => change(fixture));
          const before = await fixture.remoteHead();

          const outcome = await publish(fixture);

          expect(outcome).toEqual({ kind: "fail", error: HASH_MISMATCH });
          expect(await fixture.remoteHead()).toBe(before);
          expect(gitSubcommands(fixture, "commit")).toEqual([]);
          expect(pushCalls(fixture)).toEqual([]);
          // 内容检查在核对之后，没核对过的版本不会拿去检查
          expect(fixture.pnpm.callsOf("content:check")).toEqual([]);
          expect(await exists(join(fixture.folder, ".publish.json"))).toBe(
            false,
          );
          expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
        },
        { withImages: true },
      );
    },
    90_000,
  );

  it("图片是核对之后才被删掉的：复制时发现文件没了，同样按「检查之后改过」处理，不推", async () => {
    await withFixture(
      async (fixture) => {
        changeWhileSyncing(fixture, () =>
          rm(join(fixture.folder, "images", "cover.png")),
        );

        const outcome = await publish(fixture);

        expect(outcome).toEqual({ kind: "fail", error: HASH_MISMATCH });
        expect(pushCalls(fixture)).toEqual([]);
      },
      { withImages: true },
    );
  }, 90_000);

  it("没人动稿子：核对通过，照常推送", async () => {
    await withFixture(async (fixture) => {
      const outcome = await publish(fixture);

      expect(outcome.kind).toBe("done");
      expect(pushCalls(fixture)).toHaveLength(1);
    });
  }, 90_000);
});
