import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

async function withPublications<T>(
  fn: (
    publications: ReturnType<typeof openStore>["publications"],
    variants: ReturnType<typeof openStore>["variants"],
    sourceId: string,
    variantId: string,
    makeVariant: (targetKey: string) => string,
  ) => T,
): Promise<T> {
  const directory = await mkdtemp(
    join(tmpdir(), "leafpress-store-publications-"),
  );
  let nextId = 0;
  let tick = 0;
  const store = openStore(join(directory, "store.sqlite"), {
    now: () => new Date(Date.parse("2026-10-05T00:00:00.000Z") + tick++ * 1000),
    newId: () => `id-${++nextId}`,
  });
  try {
    const source = store.sources.upsert({
      platform: "blog",
      kind: "article",
      ref: "zh/example",
      title: "原稿",
      contentHash: "hash",
    }).source;
    const makeVariant = (targetKey: string): string =>
      store.variants.create({
        sourceId: source.id,
        platform: "zhihu",
        format: "answer",
        targetKey,
      }).id;
    const variantId = makeVariant("");
    return fn(
      store.publications,
      store.variants,
      source.id,
      variantId,
      makeVariant,
    );
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const concurrentBeginScript = `
import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { openStore } from "./src/store/open.ts";

const [dbFile, variantId, gateFile, readyPrefix] = process.argv.slice(1);
const store = openStore(dbFile);
writeFileSync(readyPrefix + process.pid, "ready");
while (!existsSync(gateFile)) await delay(5);
try {
  store.publications.begin({ variantId, mode: "api" });
  console.log("won");
} catch (error) {
  if (error?.code !== "PUBLISH_IN_DOUBT") throw error;
  console.log("blocked");
} finally {
  store.close();
}
`;

async function runConcurrentBegins(
  dbFile: string,
  directory: string,
  variantId: string,
): Promise<{ readonly code: number | null; readonly output: string }[]> {
  const gateFile = join(directory, "begin-start");
  const readyPrefix = join(directory, "begin-ready-");
  const children = Array.from(
    { length: 2 },
    () =>
      new Promise<{ code: number | null; output: string }>((resolve) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "--input-type=module",
            "-e",
            concurrentBeginScript,
            dbFile,
            variantId,
            gateFile,
            readyPrefix,
          ],
          { cwd: process.cwd(), windowsHide: true },
        );
        let output = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.once("error", (error) =>
          resolve({ code: null, output: error.message }),
        );
        child.once("close", (code) => resolve({ code, output }));
      }),
  );

  let readinessError: unknown;
  const deadline = Date.now() + 20_000;
  try {
    while (Date.now() < deadline) {
      const ready = (await readdir(directory)).filter((file) =>
        file.startsWith("begin-ready-"),
      ).length;
      if (ready === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (
      (await readdir(directory)).filter((file) =>
        file.startsWith("begin-ready-"),
      ).length !== 2
    ) {
      throw new Error("begin 竞争子进程未就绪");
    }
  } catch (error) {
    readinessError = error;
  }
  await writeFile(gateFile, "go");
  const results = await Promise.all(children);
  if (readinessError !== undefined) {
    if (readinessError instanceof Error) throw readinessError;
    throw new Error("并发 begin 子进程未就绪。");
  }
  return results;
}

describe("发布记录库", () => {
  it("两个独立进程同时 begin 同一目标时恰好一个成功", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-publish-race-"),
    );
    const dbFile = join(directory, "store.sqlite");
    let nextId = 0;
    const setup = openStore(dbFile, {
      newId: () => `race-${++nextId}`,
    });
    try {
      const source = setup.sources.upsert({
        platform: "blog",
        kind: "article",
        ref: "zh/race",
        title: "竞争发布",
        contentHash: "hash",
      }).source;
      const variant = setup.variants.create({
        sourceId: source.id,
        platform: "zhihu",
        format: "answer",
      });
      setup.close();

      const results = await runConcurrentBegins(dbFile, directory, variant.id);
      expect(results.map((result) => result.code)).toEqual([0, 0]);
      expect(results.map((result) => result.output.trim()).sort()).toEqual([
        "blocked",
        "won",
      ]);
    } finally {
      setup.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("发布完成后更新版本，并阻止 begin 和 recordManual 重复写入", async () => {
    await withPublications((publications, variants, _sourceId, variantId) => {
      const pending = publications.begin({ variantId, mode: "api" });
      expect(pending.status).toBe("pending");
      expect(pending.note).toBeUndefined();
      const published = publications.complete(pending.id, {
        status: "published",
        url: "https://www.zhihu.com/answer/123",
        platformContentId: "123",
        raw: { nested: { accepted: true } },
      });
      expect(published).toMatchObject({
        status: "published",
        url: "https://www.zhihu.com/answer/123",
        platformContentId: "123",
        raw: { nested: { accepted: true } },
      });
      expect(published.note).toBeUndefined();
      expect(() =>
        publications.complete(published.id, {
          status: "published",
          url: "https://www.zhihu.com/answer/duplicate",
        }),
      ).toThrow(expect.objectContaining({ code: "STORE_FAILED" }));
      expect(variants.get(variantId)?.status).toBe("published");

      expect(() => publications.begin({ variantId, mode: "api" })).toThrow(
        expect.objectContaining({ code: "ALREADY_PUBLISHED" }),
      );
      expect(() =>
        publications.recordManual({
          variantId,
          url: "https://example.com/manual",
        }),
      ).toThrow(expect.objectContaining({ code: "ALREADY_PUBLISHED" }));
      expect(publications.listByVariant(variantId)).toHaveLength(1);
    });
  });

  it("pending 和 unverified 都阻止重发，abort 与 discard 后可以重试", async () => {
    await withPublications((publications, _variants, _sourceId, variantId) => {
      const pending = publications.begin({ variantId, mode: "external-cli" });
      expect(() =>
        publications.begin({ variantId, mode: "external-cli" }),
      ).toThrow(expect.objectContaining({ code: "PUBLISH_IN_DOUBT" }));
      expect(() =>
        publications.recordManual({
          variantId,
          url: "https://example.com/manual",
        }),
      ).toThrow(expect.objectContaining({ code: "PUBLISH_IN_DOUBT" }));
      expect(() => publications.discard(pending.id)).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
      publications.abort(pending.id);
      expect(publications.get(pending.id)).toBeUndefined();

      const uncertain = publications.begin({ variantId, mode: "external-cli" });
      const unverified = publications.complete(uncertain.id, {
        status: "unverified",
        reason: "平台请求超时",
        raw: { response: "timeout" },
      });
      expect(unverified.status).toBe("unverified");
      expect(publications.get(uncertain.id)?.note).toBe("平台请求超时");
      expect(() =>
        publications.recordManual({
          variantId,
          url: "https://example.com/manual",
        }),
      ).toThrow(expect.objectContaining({ code: "PUBLISH_IN_DOUBT" }));
      expect(() =>
        publications.begin({ variantId, mode: "external-cli" }),
      ).toThrow(expect.objectContaining({ code: "PUBLISH_IN_DOUBT" }));
      publications.discard(uncertain.id);
      expect(
        publications.begin({ variantId, mode: "external-cli" }).status,
      ).toBe("pending");
    });
  });

  it("confirm 后成为已发布，recordManual 可登记新目标", async () => {
    await withPublications(
      (publications, variants, _sourceId, variantId, makeVariant) => {
        const unverified = publications.begin({ variantId, mode: "browser" });
        const reason = "没有确认页面结果";
        publications.complete(unverified.id, {
          status: "unverified",
          reason,
        });
        expect(publications.get(unverified.id)?.note).toBe(reason);
        const confirmed = publications.confirm(unverified.id, {
          url: "https://www.zhihu.com/answer/confirmed",
          platformContentId: "confirmed",
        });
        expect(confirmed.status).toBe("published");
        expect(confirmed.note).toBe(reason);
        expect(variants.get(variantId)?.status).toBe("published");

        const otherTarget = makeVariant("question-2");
        const manual = publications.recordManual({
          variantId: otherTarget,
          url: "https://www.zhihu.com/answer/manual",
          publishedAt: "2026-10-04T00:00:00.000Z",
        });
        expect(manual).toMatchObject({ mode: "manual", status: "published" });
        expect(manual.note).toBeUndefined();
        expect(variants.get(otherTarget)?.status).toBe("published");
      },
    );
  });

  it("findBlocking 在同一目标同时有已发布和待处理记录时优先返回已发布", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-publication-priority-"),
    );
    const dbFile = join(directory, "store.sqlite");
    const store = openStore(dbFile);
    let seed: DatabaseSync | undefined;
    try {
      const source = store.sources.upsert({
        platform: "blog",
        kind: "article",
        ref: "zh/priority",
        title: "发布优先级",
        contentHash: "hash",
      }).source;
      const publishedVariant = store.variants.create({
        sourceId: source.id,
        platform: "zhihu",
        format: "answer",
        targetKey: "same-target",
      });
      const pendingVariant = store.variants.create({
        sourceId: source.id,
        platform: "zhihu",
        format: "answer",
        targetKey: "same-target",
      });
      const published = store.publications.recordManual({
        variantId: publishedVariant.id,
        url: "https://example.com/published",
      });

      seed = new DatabaseSync(dbFile);
      seed
        .prepare(
          `INSERT INTO publications (
            id, variant_id, platform, format, mode, status, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "shadow-pending",
          pendingVariant.id,
          "zhihu",
          "answer",
          "api",
          "pending",
          "2000-01-01T00:00:00.000Z",
        );
      seed.close();
      seed = undefined;

      expect(
        store.publications.findBlocking(
          source.id,
          "zhihu",
          "answer",
          "same-target",
        ),
      ).toEqual(published);
    } finally {
      seed?.close();
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("不同 targetKey 互不阻塞且 findBlocking 优先返回已发布记录", async () => {
    await withPublications(
      (publications, _variants, sourceId, firstVariant, makeVariant) => {
        const secondVariant = makeVariant("question-2");
        const pending = publications.begin({
          variantId: firstVariant,
          mode: "api",
        });
        expect(
          publications.findBlocking(sourceId, "zhihu", "answer", "")?.id,
        ).toBe(pending.id);
        expect(
          publications.begin({ variantId: secondVariant, mode: "api" }).status,
        ).toBe("pending");
        publications.complete(pending.id, {
          status: "published",
          url: "https://example.com/one",
        });
        expect(
          publications.findBlocking(sourceId, "zhihu", "answer", "")?.status,
        ).toBe("published");
      },
    );
  });

  it("拒绝空链接和不符合前置状态的操作", async () => {
    await withPublications(
      (publications, _variants, _sourceId, variantId, makeVariant) => {
        const pending = publications.begin({ variantId, mode: "api" });
        expect(() =>
          publications.complete(pending.id, { status: "published", url: "" }),
        ).toThrow("已发布状态必须填写非空链接。");
        expect(() =>
          publications.confirm(pending.id, { url: "https://example.com" }),
        ).toThrow("发布记录「id-4」不是待核实状态。");
        const emptyLinkTarget = makeVariant("manual-empty");
        expect(() =>
          publications.recordManual({ variantId: emptyLinkTarget, url: "" }),
        ).toThrow("已发布状态必须填写非空链接。");
        expect(() => publications.abort("missing")).toThrow(
          "发布记录「missing」不是待撤销状态。",
        );
        expect(publications.get(pending.id)?.status).toBe("pending");
      },
    );
  });
});
