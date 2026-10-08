import { describe, expect, it } from "vitest";

import { account, withStore } from "./helpers.js";

describe("账号与配置 Repo", () => {
  it("账号可增改查，省略字段保持不存在并按创建时间和编号排序", async () => {
    await withStore((store) => {
      store.accounts.insert(account("blog-2"));
      store.accounts.insert({
        ...account("blog-1"),
        createdAt: "2025-12-01T00:00:00+08:00",
        handle: "author",
      });
      expect(store.accounts.list()).toEqual([
        {
          ...account("blog-1"),
          createdAt: "2025-12-01T00:00:00+08:00",
          handle: "author",
        },
        account("blog-2"),
      ]);
      expect(store.accounts.get("blog-2")).toEqual(account("blog-2"));

      const updated = {
        ...account("blog-2"),
        handle: "新名字",
        url: "https://example.test/作者",
        stage: "paused" as const,
      };
      store.accounts.update(updated);
      expect(store.accounts.get("blog-2")).toEqual(updated);
      expect(store.meta.version()).toEqual({ seq: 3, snapshotSeq: 0 });
    });
  });

  it("重复账号和更新不存在的账号抛 STORE_FAILED", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      expect(() => store.accounts.insert(account())).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
      expect(() => store.accounts.update(account("missing"))).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
      expect(store.meta.version()).toEqual({ seq: 1, snapshotSeq: 0 });
    });
  });

  it("普通值、密钥占位和过期项互不泄漏，写操作推进 seq", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      store.settings.set(
        "blog-1",
        "timezone",
        "Asia/Shanghai",
        "2026-01-02T03:04:05+08:00",
      );
      expect(store.settings.values("blog-1")).toEqual({
        timezone: "Asia/Shanghai",
      });
      expect(store.settings.expired("blog-1")).toEqual({});

      store.settings.set(
        "blog-1",
        "api-token",
        undefined,
        "2026-01-02T03:05:00+08:00",
      );
      expect(store.settings.values("blog-1")).toEqual({
        timezone: "Asia/Shanghai",
      });
      store.settings.markExpired(
        "blog-1",
        "api-token",
        "接口返回 401",
        "2026-01-02T03:06:00+08:00",
      );
      expect(store.settings.expired("blog-1")).toEqual({
        "api-token": "接口返回 401",
      });
      store.settings.markExpired(
        "blog-1",
        "timezone",
        "配置无效",
        "2026-01-02T03:07:00+08:00",
      );
      expect(store.settings.values("blog-1")).toEqual({
        timezone: "Asia/Shanghai",
      });
      expect(store.settings.expired("blog-1")).toEqual({
        "api-token": "接口返回 401",
        timezone: "配置无效",
      });
      store.settings.set(
        "blog-1",
        "timezone",
        "UTC",
        "2026-01-02T03:08:00+08:00",
      );
      expect(store.settings.expired("blog-1")).toEqual({
        "api-token": "接口返回 401",
      });
      store.settings.clear("blog-1", "api-token");
      expect(store.settings.expired("blog-1")).toEqual({});
      expect(store.settings.values("blog-1")).toEqual({ timezone: "UTC" });
      expect(store.meta.version()).toEqual({ seq: 7, snapshotSeq: 0 });
    });
  });
});
