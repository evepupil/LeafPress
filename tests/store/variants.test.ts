import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

interface VariantFixtureOptions {
  readonly sameTimestamp?: boolean;
  readonly newId?: () => string;
}

async function withVariants<T>(
  fn: (
    variants: ReturnType<typeof openStore>["variants"],
    sourceId: string,
  ) => T,
  fixtureOptions: VariantFixtureOptions = {},
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-store-variants-"));
  let nextId = 0;
  let tick = 0;
  const store = openStore(join(directory, "store.sqlite"), {
    now: () =>
      new Date(
        Date.parse("2026-10-05T00:00:00.000Z") +
          (fixtureOptions.sameTimestamp ? 0 : tick++ * 1000),
      ),
    newId: fixtureOptions.newId ?? (() => `id-${++nextId}`),
  });
  try {
    const source = store.sources.upsert({
      platform: "blog",
      kind: "article",
      ref: "zh/example",
      title: "原稿",
      contentHash: "hash",
    }).source;
    return fn(store.variants, source.id);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

describe("版本记录库", () => {
  it("创建时使用默认值并能往返嵌套 JSON", async () => {
    await withVariants((variants, sourceId) => {
      const variant = variants.create({
        sourceId,
        platform: "zhihu",
        format: "answer",
        targetKey: "question-1",
        options: {
          question: { title: "问题标题", path: "C:\\内容\\问题.md" },
        },
      });
      expect(variant).toMatchObject({
        sourceId,
        platform: "zhihu",
        format: "answer",
        targetKey: "question-1",
        status: "draft",
        options: {
          question: { title: "问题标题", path: "C:\\内容\\问题.md" },
        },
      });
      expect(variant.draftPath).toBeUndefined();
      expect(variants.get(variant.id)).toEqual(variant);
    });
  });

  it("更新版本并按原稿创建时间升序列出", async () => {
    await withVariants((variants, sourceId) => {
      const first = variants.create({
        sourceId,
        platform: "blog",
        format: "article",
      });
      const second = variants.create({
        sourceId,
        platform: "zhihu",
        format: "post",
      });
      const updated = variants.update(first.id, {
        status: "pending-confirm",
        draftPath: "C:\\LeafPress\\draft.md",
        options: { nested: { count: 3 } },
      });

      expect(updated.status).toBe("pending-confirm");
      expect(updated.draftPath).toBe("C:\\LeafPress\\draft.md");
      expect(updated.options).toEqual({ nested: { count: 3 } });
      expect(updated.updatedAt).not.toBe(first.updatedAt);
      expect(
        variants.update(first.id, { draftPath: null }).draftPath,
      ).toBeUndefined();
      expect(
        variants.listBySource(sourceId).map((variant) => variant.id),
      ).toEqual([first.id, second.id]);
      expect(variants.listBySource("missing")).toEqual([]);
    });
  });

  it("相同毫秒创建的版本仍按插入顺序返回", async () => {
    const ids = [
      "work",
      "source",
      "first-zhihu",
      "second-blog",
      "third-bilibili",
    ];
    await withVariants(
      (variants, sourceId) => {
        const created = [
          variants.create({
            sourceId,
            platform: "zhihu",
            format: "post",
          }),
          variants.create({
            sourceId,
            platform: "blog",
            format: "article",
          }),
          variants.create({
            sourceId,
            platform: "bilibili",
            format: "video-landscape",
          }),
        ];
        expect(
          created.map(({ platform, format }) => [platform, format]),
        ).toEqual([
          ["zhihu", "post"],
          ["blog", "article"],
          ["bilibili", "video-landscape"],
        ]);
        expect(
          variants.listBySource(sourceId).map((variant) => variant.id),
        ).toEqual(created.map((variant) => variant.id));
      },
      {
        sameTimestamp: true,
        newId: () => ids.shift() ?? "unexpected",
      },
    );
  });

  it("原稿或待更新版本不存在时抛 STORE_FAILED", async () => {
    await withVariants((variants) => {
      expect(() =>
        variants.create({
          sourceId: "missing",
          platform: "blog",
          format: "article",
        }),
      ).toThrow("原稿「missing」不存在，无法创建版本。");
      expect(() => variants.update("missing", { status: "abandoned" })).toThrow(
        "版本「missing」不存在，无法更新。",
      );
    });
  });
});
