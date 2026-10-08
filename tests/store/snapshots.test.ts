import { describe, expect, it } from "vitest";

import { account, withStore, work } from "./helpers.js";

describe("数据快照 Repo", () => {
  it("账号日数据按账号和日期覆盖写并按闭区间读取", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      store.snapshots.putAccountDay({
        accountId: "blog-1",
        day: "2026-01-01",
        followers: 10,
        reads: null,
        interactions: 2,
      });
      store.snapshots.putAccountDay({
        accountId: "blog-1",
        day: "2026-01-02",
        followers: null,
        reads: 40,
        interactions: 3,
      });
      store.snapshots.putAccountDay({
        accountId: "blog-1",
        day: "2026-01-01",
        followers: 11,
        reads: 12,
        interactions: null,
      });
      expect(store.snapshots.accountDays("2026-01-01", "2026-01-02")).toEqual([
        {
          accountId: "blog-1",
          day: "2026-01-01",
          followers: 11,
          reads: 12,
          interactions: null,
        },
        {
          accountId: "blog-1",
          day: "2026-01-02",
          followers: null,
          reads: 40,
          interactions: 3,
        },
      ]);
      expect(
        store.snapshots.accountDays("2026-01-02", "2026-01-02"),
      ).toHaveLength(1);
      expect(store.meta.version()).toEqual({ seq: 4, snapshotSeq: 3 });
    });
  });

  it("作品快照包含每个作品 from 之前的最后一条，过期日期不覆盖 totals", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      store.works.insert(work("work-1"));
      store.works.insert(work("work-2"));
      store.snapshots.putWorkSnapshot({
        workId: "work-1",
        day: "2026-01-01",
        totals: { reads: 10 },
      });
      store.snapshots.putWorkSnapshot({
        workId: "work-1",
        day: "2026-01-02",
        totals: { reads: 20, likes: 2 },
      });
      store.snapshots.putWorkSnapshot({
        workId: "work-1",
        day: "2026-01-04",
        totals: { reads: 40, likes: 4 },
      });
      store.snapshots.putWorkSnapshot({
        workId: "work-2",
        day: "2026-01-02",
        totals: { reads: 5 },
      });
      store.snapshots.putWorkSnapshot({
        workId: "work-1",
        day: "2026-01-03",
        totals: { reads: 30 },
      });

      expect(store.snapshots.workSnapshots("2026-01-03", "2026-01-04")).toEqual(
        [
          {
            workId: "work-1",
            day: "2026-01-02",
            totals: { reads: 20, likes: 2 },
          },
          { workId: "work-1", day: "2026-01-03", totals: { reads: 30 } },
          {
            workId: "work-1",
            day: "2026-01-04",
            totals: { reads: 40, likes: 4 },
          },
          { workId: "work-2", day: "2026-01-02", totals: { reads: 5 } },
        ],
      );
      expect(store.works.get("work-1")).toMatchObject({
        totals: { reads: 40, likes: 4 },
        totalsDay: "2026-01-04",
      });
      expect(store.works.get("work-2")).toMatchObject({
        totals: { reads: 5 },
        totalsDay: "2026-01-02",
      });
      expect(store.meta.version()).toEqual({ seq: 8, snapshotSeq: 5 });
    });
  });

  it("拒绝账号日数据和作品快照中的非有限数且不泄露输入值", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      store.works.insert(work("work-1"));
      const captureFailure = (run: () => void): Error => {
        try {
          run();
        } catch (error) {
          if (error instanceof Error) return error;
          throw error;
        }
        throw new Error("预期写入失败");
      };
      const invalidDays = [
        { followers: Number.NaN, reads: null, interactions: null },
        {
          followers: null,
          reads: Number.POSITIVE_INFINITY,
          interactions: null,
        },
        {
          followers: null,
          reads: null,
          interactions: Number.NEGATIVE_INFINITY,
        },
      ];
      for (const [index, values] of invalidDays.entries()) {
        const column = ["followers", "reads", "interactions"][index]!;
        const error = captureFailure(() =>
          store.snapshots.putAccountDay({
            accountId: "blog-1",
            day: `2026-01-0${index + 1}`,
            ...values,
          }),
        );
        expect(error).toMatchObject({ code: "STORE_FAILED" });
        expect(error.message).toContain("account_days");
        expect(error.message).toContain(column);
        expect(error.message).not.toMatch(/NaN|Infinity/);
      }
      const snapshotError = captureFailure(() =>
        store.snapshots.putWorkSnapshot({
          workId: "work-1",
          day: "2026-01-04",
          totals: { reads: Number.POSITIVE_INFINITY },
        }),
      );
      expect(snapshotError).toMatchObject({ code: "STORE_FAILED" });
      expect(snapshotError.message).toContain("work_snapshots");
      expect(snapshotError.message).toContain("totals");
      expect(snapshotError.message).not.toContain("Infinity");
      expect(store.meta.version()).toEqual({ seq: 2, snapshotSeq: 0 });
    });
  });
});
