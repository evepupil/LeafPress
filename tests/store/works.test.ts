import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

async function withWorks<T>(
  fn: (works: ReturnType<typeof openStore>["works"]) => T,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-store-works-"));
  const store = openStore(join(directory, "store.sqlite"), {
    now: () => new Date("2026-10-05T00:00:00.000Z"),
    newId: (() => {
      let nextId = 0;
      return () => `work-${++nextId}`;
    })(),
  });
  try {
    return fn(store.works);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

describe("作品记录库", () => {
  it("创建作品并按编号读回", async () => {
    await withWorks((works) => {
      const created = works.create({ title: "测试作品" });
      expect(created).toEqual({
        id: "work-1",
        title: "测试作品",
        createdAt: "2026-10-05T00:00:00.000Z",
        updatedAt: "2026-10-05T00:00:00.000Z",
      });
      expect(works.get(created.id)).toEqual(created);
      expect(works.get("missing")).toBeUndefined();
    });
  });
});
