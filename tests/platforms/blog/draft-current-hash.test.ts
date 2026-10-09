/**
 * currentDraftHash：任务文件夹里稿子此刻的指纹。
 * 检查跑了好几分钟，回头问「稿子这期间改过没有」就靠它：整个文件夹重新读一遍再算。
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  currentDraftHash,
  hashDraft,
  loadDraft,
} from "../../../src/platforms/blog/steps/draft.js";
import { draftText } from "./steps-fixtures.js";

let folder = "";

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "leafpress-currenthash-"));
  await writeFile(join(folder, "slug.txt"), "my-post\n", "utf8");
  await writeFile(
    join(folder, "中文稿.mdx"),
    draftText({ title: "标题", locale: "zh-CN" }),
    "utf8",
  );
  await writeFile(
    join(folder, "英文稿.mdx"),
    draftText({ title: "Title", locale: "en" }),
    "utf8",
  );
  await mkdir(join(folder, "images"), { recursive: true });
  await writeFile(join(folder, "images", "a.png"), Buffer.from([1]));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("currentDraftHash", () => {
  it("没人动过：和开始时 loadDraft + hashDraft 算出的一样", async () => {
    const started = await hashDraft(await loadDraft(folder));

    expect(await currentDraftHash(folder)).toBe(started);
  });

  it("中文稿、英文稿、slug.txt、图片内容任何一处被改：指纹变", async () => {
    const started = await currentDraftHash(folder);
    const seen = new Set([started]);
    const edits: [string, () => Promise<void>][] = [
      [
        "中文稿",
        () =>
          writeFile(
            join(folder, "中文稿.mdx"),
            draftText({ title: "改过", locale: "zh-CN" }),
          ),
      ],
      [
        "英文稿",
        () =>
          writeFile(
            join(folder, "英文稿.mdx"),
            draftText({ title: "Changed", locale: "en" }),
          ),
      ],
      ["slug.txt", () => writeFile(join(folder, "slug.txt"), "other-post\n")],
      [
        "图片内容",
        () => writeFile(join(folder, "images", "a.png"), Buffer.from([9])),
      ],
    ];
    for (const [name, edit] of edits) {
      await edit();
      const changed = await currentDraftHash(folder);
      expect(changed, `${name} 改了指纹却没变`).toBeDefined();
      expect(seen.has(changed), `${name} 改了指纹却没变`).toBe(false);
      seen.add(changed);
    }
  });

  it("期间新增了一张图片：指纹变（开始时读到的文件清单蒙不住它）", async () => {
    const started = await currentDraftHash(folder);

    await writeFile(join(folder, "images", "added.png"), Buffer.from([2]));

    expect(await currentDraftHash(folder)).not.toBe(started);
  });

  it("期间删掉了一张图片：指纹变，不抛错", async () => {
    const started = await currentDraftHash(folder);

    await rm(join(folder, "images", "a.png"));

    const now = await currentDraftHash(folder);
    expect(now).toBeDefined();
    expect(now).not.toBe(started);
  });

  it("稿子被删掉或改得读不出来：返回 undefined（调用方当作改过）", async () => {
    await rm(join(folder, "中文稿.mdx"));
    expect(await currentDraftHash(folder)).toBeUndefined();

    await writeFile(
      join(folder, "中文稿.mdx"),
      draftText({ title: "标题", locale: "zh-CN" }).replace(
        "draft: false",
        "draft: true",
      ),
    );
    expect(await currentDraftHash(folder)).toBeUndefined();

    await rm(join(folder, "slug.txt"));
    expect(await currentDraftHash(folder)).toBeUndefined();
  });
});
