import type { Idea } from "@leafpress/core";
import { describe, expect, it } from "vitest";

import { account, withStore, work } from "./helpers.js";

function idea(id: string, overrides: Partial<Idea> = {}): Idea {
  return {
    id,
    text: "从日志整理一篇中文文章",
    detail: "补充背景和 Windows 路径 C:\\资料\\原稿.md",
    status: "promising",
    source: "devlog",
    order: 2,
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: "2026-01-02T00:00:00+08:00",
    workIds: ["caller-value-is-ignored"],
    ...overrides,
  };
}

describe("灵感 Repo", () => {
  it("忽略传入的 workIds，按作品创建时间和编号推导来源作品", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      store.ideas.insert(idea("idea-1"));
      store.works.insert(
        work("work-z", {
          accountId: "blog-1",
          source: { kind: "idea", ideaId: "idea-1" },
          createdAt: "2026-01-03T00:00:00+08:00",
        }),
      );
      store.works.insert(
        work("work-b", {
          accountId: "blog-1",
          source: { kind: "idea", ideaId: "idea-1" },
          createdAt: "2026-01-02T00:00:00+08:00",
        }),
      );
      store.works.insert(
        work("work-a", {
          accountId: "blog-1",
          source: { kind: "idea", ideaId: "idea-1" },
          createdAt: "2026-01-02T00:00:00+08:00",
        }),
      );
      expect(store.ideas.get("idea-1")).toEqual({
        ...idea("idea-1"),
        workIds: ["work-a", "work-b", "work-z"],
      });
      expect(store.ideas.list()).toEqual([
        { ...idea("idea-1"), workIds: ["work-a", "work-b", "work-z"] },
      ]);

      store.works.remove("work-b");
      expect(store.ideas.get("idea-1")?.workIds).toEqual(["work-a", "work-z"]);
    });
  });

  it("更新整行、删除灵感，缺失更新失败且失败不推进 seq", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      store.ideas.insert(idea("idea-1", { accountId: "blog-1" }));
      expect(store.ideas.get("idea-1")?.accountId).toBe("blog-1");
      const updated = idea("idea-1", {
        text: "更新后的标题",
        sourceDetail: "模块记录",
        accountId: "blog-1",
      });
      store.ideas.update(updated);
      expect(store.ideas.get("idea-1")).toEqual({ ...updated, workIds: [] });
      expect(store.ideas.get("idea-1")?.accountId).toBe("blog-1");
      const cleared = idea("idea-1", { text: "更新后的标题" });
      store.ideas.update(cleared);
      expect(store.ideas.get("idea-1")).toEqual({ ...cleared, workIds: [] });
      expect(store.ideas.get("idea-1")?.accountId).toBeUndefined();
      expect(() => store.ideas.update(idea("missing"))).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
      store.ideas.remove("idea-1");
      expect(store.ideas.get("idea-1")).toBeUndefined();
      expect(store.meta.version()).toEqual({ seq: 5, snapshotSeq: 0 });
    });
  });
});
