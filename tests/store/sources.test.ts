import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

async function withSources<T>(
  fn: (
    sources: ReturnType<typeof openStore>["sources"],
    works: ReturnType<typeof openStore>["works"],
  ) => T,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-store-sources-"));
  let nextId = 0;
  let tick = 0;
  const store = openStore(join(directory, "store.sqlite"), {
    now: () => new Date(Date.parse("2026-10-05T00:00:00.000Z") + tick++ * 1000),
    newId: () => `id-${++nextId}`,
  });
  try {
    return fn(store.sources, store.works);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

describe("原稿记录库", () => {
  it("upsert 新建作品、识别无变化并在变化时更新时间", async () => {
    await withSources((sources, works) => {
      const input = {
        platform: "blog",
        kind: "article" as const,
        ref: "zh/example",
        title: "原稿标题",
        locale: "zh-CN",
        contentHash: "hash-1",
        publishedAt: "2026-10-01",
      };
      const created = sources.upsert(input);
      expect(created.created).toBe(true);
      expect(created.changed).toBe(false);
      expect(created.source).toMatchObject(input);
      expect(works.get(created.source.workId)?.title).toBe("原稿标题");

      const unchanged = sources.upsert(input);
      expect(unchanged.created).toBe(false);
      expect(unchanged.changed).toBe(false);
      expect(unchanged.source.updatedAt).toBe(created.source.updatedAt);

      const updated = sources.upsert({
        ...input,
        title: "更新后的标题",
        contentHash: "hash-2",
      });
      expect(updated.created).toBe(false);
      expect(updated.changed).toBe(true);
      expect(updated.source.title).toBe("更新后的标题");
      expect(updated.source.contentHash).toBe("hash-2");
      expect(updated.source.updatedAt).not.toBe(created.source.updatedAt);
      expect(sources.get(created.source.id)).toEqual(updated.source);
      expect(sources.getByRef("blog", "zh/example")).toEqual(updated.source);
    });
  });

  it("按 ref 升序列出原稿并支持平台过滤", async () => {
    await withSources((sources) => {
      const common = {
        kind: "article" as const,
        title: "标题",
        contentHash: "hash",
      };
      sources.upsert({ ...common, platform: "blog", ref: "zh/z" });
      sources.upsert({ ...common, platform: "blog", ref: "zh/a" });
      sources.upsert({ ...common, platform: "other", ref: "x/1" });

      expect(sources.list().map((source) => source.ref)).toEqual([
        "x/1",
        "zh/a",
        "zh/z",
      ]);
      expect(sources.list("blog").map((source) => source.ref)).toEqual([
        "zh/a",
        "zh/z",
      ]);
    });
  });
});
