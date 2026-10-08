import { describe, expect, it } from "vitest";

import { account, withStore } from "./helpers.js";

describe("变更序号与事务", () => {
  it("每个写方法递增 seq，序号从 1 起且读操作不修改版本", async () => {
    await withStore((store) => {
      expect(store.meta.version()).toEqual({ seq: 0, snapshotSeq: 0 });
      expect(store.meta.nextSerial("work")).toBe(1);
      expect(store.meta.nextSerial("work")).toBe(2);
      expect(store.meta.nextSerial("idea")).toBe(1);
      expect(store.meta.nextSerial("account")).toBe(1);
      expect(store.meta.version()).toEqual({ seq: 4, snapshotSeq: 0 });
      expect(store.meta.version()).toEqual({ seq: 4, snapshotSeq: 0 });

      store.accounts.insert(account());
      store.accounts.update({ ...account(), name: "修改名称" });
      store.settings.set(
        "blog-1",
        "theme",
        "light",
        "2026-01-01T00:00:00+08:00",
      );
      store.settings.clear("blog-1", "theme");
      store.settings.markExpired(
        "blog-1",
        "token",
        "已失效",
        "2026-01-01T00:00:00+08:00",
      );
      expect(store.meta.version()).toEqual({ seq: 9, snapshotSeq: 0 });
    });
  });

  it("嵌套 Store.transaction 参与外层事务，异常回滚数据和 seq", async () => {
    await withStore((store) => {
      store.transaction(() => {
        store.accounts.insert(account());
        store.transaction(() => {
          store.notes.save({
            week: "2026-01-05",
            wins: "完成",
            improve: "",
            next: "",
            updatedAt: "2026-01-11T00:00:00+08:00",
          });
        });
      });
      expect(store.accounts.get("blog-1")).toEqual(account());
      expect(store.notes.list()).toHaveLength(1);
      expect(store.meta.version()).toEqual({ seq: 2, snapshotSeq: 0 });

      const failure = new Error("外层事务失败");
      expect(() =>
        store.transaction(() => {
          store.accounts.update({ ...account(), name: "不能保留" });
          store.notes.save({
            week: "2026-01-12",
            wins: "回滚",
            improve: "",
            next: "",
            updatedAt: "2026-01-18T00:00:00+08:00",
          });
          throw failure;
        }),
      ).toThrow(failure);
      expect(store.accounts.get("blog-1")?.name).toBe("中文账号");
      expect(store.notes.list()).toHaveLength(1);
      expect(store.meta.version()).toEqual({ seq: 2, snapshotSeq: 0 });
    });
  });

  it("嵌套回调抛错时回滚外层写入和变更序号", async () => {
    await withStore((store) => {
      const failure = new Error("嵌套事务失败");
      expect(() =>
        store.transaction(() => {
          store.accounts.insert(account());
          store.transaction(() => {
            store.notes.save({
              week: "2026-01-05",
              wins: "回滚",
              improve: "",
              next: "",
              updatedAt: "2026-01-11T00:00:00+08:00",
            });
            throw failure;
          });
        }),
      ).toThrow(failure);
      expect(store.accounts.list()).toEqual([]);
      expect(store.notes.list()).toEqual([]);
      expect(store.meta.version()).toEqual({ seq: 0, snapshotSeq: 0 });
    });
  });

  it("拒绝异步顶层事务回调并回滚其中的写入", async () => {
    await withStore(async (store) => {
      expect(() =>
        store.transaction(async () => {
          await Promise.resolve();
          store.accounts.insert(account());
        }),
      ).toThrow(
        expect.objectContaining({
          code: "STORE_FAILED",
          message: "事务回调不能是异步函数。",
        }),
      );
      await Promise.resolve();
      expect(store.accounts.list()).toEqual([]);
      expect(store.meta.version()).toEqual({ seq: 0, snapshotSeq: 0 });
    });
  });

  it("拒绝异步嵌套事务回调并回滚外层全部写入", async () => {
    await withStore(async (store) => {
      expect(() =>
        store.transaction(() => {
          store.accounts.insert(account());
          void store.transaction(async () => {
            await Promise.resolve();
            store.notes.save({
              week: "2026-01-05",
              wins: "不能保留",
              improve: "",
              next: "",
              updatedAt: "2026-01-11T00:00:00+08:00",
            });
          });
        }),
      ).toThrow(
        expect.objectContaining({
          code: "STORE_FAILED",
          message: "事务回调不能是异步函数。",
        }),
      );
      await Promise.resolve();
      expect(store.accounts.list()).toEqual([]);
      expect(store.notes.list()).toEqual([]);
      expect(store.meta.version()).toEqual({ seq: 0, snapshotSeq: 0 });
    });
  });
});
