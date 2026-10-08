import { describe, expect, it } from "vitest";

import { account, withStore } from "./helpers.js";

describe("拉取记录与复盘 Repo", () => {
  it("每个账号只返回按写入先后的最新拉取记录", async () => {
    await withStore((store) => {
      store.accounts.insert(account("blog-1"));
      store.accounts.insert(account("blog-2"));
      store.pulls.add({
        accountId: "blog-1",
        at: "2026-01-01T00:00:00+08:00",
        status: "ok",
        note: "首次拉取",
      });
      store.pulls.add({
        accountId: "blog-2",
        at: "2026-01-02T00:00:00+08:00",
        status: "failed",
        reason: "暂时不可用",
        fixHint: "稍后重试",
      });
      store.pulls.add({
        accountId: "blog-1",
        at: "2026-01-03T00:00:00+08:00",
        status: "failed",
        reason: "超时",
      });
      expect(store.pulls.latest()).toEqual([
        {
          accountId: "blog-1",
          at: "2026-01-03T00:00:00+08:00",
          status: "failed",
          reason: "超时",
        },
        {
          accountId: "blog-2",
          at: "2026-01-02T00:00:00+08:00",
          status: "failed",
          reason: "暂时不可用",
          fixHint: "稍后重试",
        },
      ]);
      expect(store.meta.version()).toEqual({ seq: 5, snapshotSeq: 0 });
    });
  });

  it("复盘按周倒序保存，updatedAt 原样往返并覆盖", async () => {
    await withStore((store) => {
      const first = {
        week: "2026-01-05",
        wins: "完成",
        improve: "聚焦",
        next: "继续",
        updatedAt: "2026-01-11T23:45:12+08:00",
      };
      const older = {
        week: "2025-12-29",
        wins: "整理",
        improve: "",
        next: "",
        updatedAt: "2026-01-04T12:30:00+08:00",
      };
      store.notes.save(first);
      store.notes.save(older);
      expect(store.notes.list()).toEqual([first, older]);
      const revised = {
        ...first,
        wins: "完成发布",
        updatedAt: "2026-01-12T00:01:02+08:00",
      };
      store.notes.save(revised);
      expect(store.notes.list()).toEqual([revised, older]);
      expect(store.meta.version()).toEqual({ seq: 3, snapshotSeq: 0 });
    });
  });
});
