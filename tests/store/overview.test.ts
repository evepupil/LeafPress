import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

describe("发布状态总览", () => {
  it("按原稿与版本目标排序联接发布记录并接受空数组", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-overview-"),
    );
    const dbFile = join(directory, "store.sqlite");
    let nextId = 0;
    let tick = 0;
    const store = openStore(dbFile, {
      now: () =>
        new Date(Date.parse("2026-10-05T00:00:00.000Z") + tick++ * 1000),
      newId: () => `id-${++nextId}`,
    });
    try {
      const sources = store.sources;
      const firstSource = sources.upsert({
        platform: "blog",
        kind: "article",
        ref: "zh/first",
        title: "第一篇",
        contentHash: "h1",
      }).source;
      const secondSource = sources.upsert({
        platform: "blog",
        kind: "article",
        ref: "zh/second",
        title: "第二篇",
        contentHash: "h2",
      }).source;
      const variants = store.variants;
      const noPublication = variants.create({
        sourceId: firstSource.id,
        platform: "blog",
        format: "article",
      });
      const pendingVariant = variants.create({
        sourceId: firstSource.id,
        platform: "zhihu",
        format: "answer",
        targetKey: "question-1",
      });
      const publishedVariant = variants.create({
        sourceId: firstSource.id,
        platform: "zhihu",
        format: "answer",
        targetKey: "question-2",
      });
      const otherFormat = variants.create({
        sourceId: firstSource.id,
        platform: "zhihu",
        format: "post",
      });
      const secondSourceVariant = variants.create({
        sourceId: secondSource.id,
        platform: "blog",
        format: "article",
      });
      const publications = store.publications;
      const pending = publications.begin({
        variantId: pendingVariant.id,
        mode: "api",
      });
      publications.recordManual({
        variantId: publishedVariant.id,
        url: "https://example.com/published",
      });

      const overview = (sourceIds: readonly string[]) =>
        store.publicationOverview(sourceIds);
      expect(overview([])).toEqual([]);
      const rows = overview([firstSource.id, secondSource.id]);
      expect(rows).toMatchObject([
        {
          sourceId: firstSource.id,
          platform: "blog",
          format: "article",
          targetKey: "",
          variantId: noPublication.id,
          variantStatus: "draft",
        },
        {
          sourceId: firstSource.id,
          platform: "zhihu",
          format: "answer",
          targetKey: "question-1",
          variantId: pendingVariant.id,
          variantStatus: "draft",
          publicationId: pending.id,
          publicationStatus: "pending",
          publishedAt: pending.publishedAt,
        },
        {
          sourceId: firstSource.id,
          platform: "zhihu",
          format: "answer",
          targetKey: "question-2",
          variantId: publishedVariant.id,
          variantStatus: "published",
          publicationStatus: "published",
          url: "https://example.com/published",
        },
        {
          sourceId: firstSource.id,
          platform: "zhihu",
          format: "post",
          targetKey: "",
          variantId: otherFormat.id,
          variantStatus: "draft",
        },
        {
          sourceId: secondSource.id,
          platform: "blog",
          format: "article",
          targetKey: "",
          variantId: secondSourceVariant.id,
          variantStatus: "draft",
        },
      ]);
      expect(typeof rows[2]?.publicationId).toBe("string");
      expect(typeof rows[2]?.publishedAt).toBe("string");
      expect(rows[0]?.publicationId).toBeUndefined();
      expect(rows[3]?.publicationId).toBeUndefined();
      expect(rows[4]?.publicationId).toBeUndefined();
    } finally {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
