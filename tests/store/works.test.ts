import type { FeedbackEntry, Work, WorkLog } from "@leafpress/core";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { account, withStore, work } from "./helpers.js";

const firstLog: WorkLog = { at: "2026-01-01T01:00:00+08:00", text: "开始写" };
const firstFeedback: FeedbackEntry = {
  at: "2026-01-01T02:00:00+08:00",
  step: 0,
  stepName: "起草",
  text: "先列大纲",
};

describe("作品 Repo", () => {
  it("作品字段和 JSON 往返，记录与反馈按条数追加", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      const initial = work("work-1", {
        title: "中文标题",
        source: { kind: "idea", ideaId: "idea-1" },
        ask: "检查这一段",
        feedback: "补一个具体例子",
        feedbackHistory: [firstFeedback],
        url: "https://example.test/post/1",
        publishedAt: "2026-01-02",
        totals: { reads: 125, likes: 8 },
        totalsDay: "2026-01-03",
        question: "问题标题",
        localPath: "C:\\LeafPress\\原稿\\文章.md",
        sourceRef: "zh/文章-1",
        tags: ["中文", "sqlite"],
        lease: {
          since: "2026-01-01T03:00:00+08:00",
          expiresAt: "2026-01-01T04:00:00+08:00",
        },
        error: "",
        log: [firstLog],
      });
      store.works.insert(initial, { token: "lease-token-1" });
      expect(store.works.get("work-1")).toEqual(initial);
      expect(store.works.leaseToken("work-1")).toBe("lease-token-1");

      const next = work("work-1", {
        ...initial,
        title: "更新后的中文标题",
        updatedAt: "2026-01-02T00:00:00+08:00",
        log: [
          firstLog,
          { at: "2026-01-02T01:00:00+08:00", text: "完成正文" },
          {
            at: "2026-01-02T02:00:00+08:00",
            text: "保存到 C:\\稿件\\最终版.md",
          },
        ],
        feedbackHistory: [
          firstFeedback,
          {
            at: "2026-01-02T03:00:00+08:00",
            step: 1,
            stepName: "润色",
            text: "语气再自然一点",
          },
        ],
      });
      store.works.update(next);
      expect(store.works.get("work-1")).toEqual(next);
      expect(store.works.list()).toEqual([next]);
      expect(store.works.leaseToken("work-1")).toBe("lease-token-1");

      store.works.update(next);
      expect(store.works.get("work-1")?.log).toHaveLength(3);
      expect(store.works.get("work-1")?.feedbackHistory).toHaveLength(2);
      store.works.update(next, null);
      expect(store.works.leaseToken("work-1")).toBeUndefined();
      store.works.update(next, { token: "lease-token-2" });
      expect(store.works.leaseToken("work-1")).toBe("lease-token-2");

      const withoutLease: Work = { ...next };
      delete withoutLease.lease;
      store.works.update(withoutLease);
      expect(store.works.get("work-1")?.lease).toBeUndefined();
      expect(store.works.leaseToken("work-1")).toBeUndefined();

      const cleared: Work = { ...withoutLease };
      delete cleared.ask;
      delete cleared.feedback;
      delete cleared.url;
      delete cleared.publishedAt;
      delete cleared.totals;
      delete cleared.totalsDay;
      delete cleared.question;
      delete cleared.localPath;
      delete cleared.sourceRef;
      delete cleared.error;
      store.works.update(cleared);
      expect(store.works.get("work-1")).toEqual(cleared);
      expect(store.meta.version()).toEqual({ seq: 8, snapshotSeq: 0 });
    });
  });

  it("拒绝非有限作品 totals，错误不包含输入值且不递增序号", async () => {
    await withStore((store) => {
      store.accounts.insert(account());
      const captureFailure = (run: () => void): Error => {
        try {
          run();
        } catch (error) {
          if (error instanceof Error) return error;
          throw error;
        }
        throw new Error("预期写入失败");
      };
      const invalidInsert = captureFailure(() =>
        store.works.insert(work("invalid", { totals: { reads: Number.NaN } })),
      );
      expect(invalidInsert).toMatchObject({ code: "STORE_FAILED" });
      expect(invalidInsert.message).toContain("works");
      expect(invalidInsert.message).toContain("totals");
      expect(invalidInsert.message).not.toContain("NaN");
      store.works.insert(work("work-1", { totals: { reads: 1 } }));

      const invalidUpdate = captureFailure(() =>
        store.works.update(
          work("work-1", { totals: { reads: Number.POSITIVE_INFINITY } }),
        ),
      );
      expect(invalidUpdate).toMatchObject({ code: "STORE_FAILED" });
      expect(invalidUpdate.message).toContain("works");
      expect(invalidUpdate.message).toContain("totals");
      expect(invalidUpdate.message).not.toContain("Infinity");
      expect(store.works.get("work-1")?.totals).toEqual({ reads: 1 });
      expect(store.meta.version()).toEqual({ seq: 2, snapshotSeq: 0 });
    });
  });

  it("作品删除级联清除记录、反馈和快照", async () => {
    await withStore((store, dbFile) => {
      store.accounts.insert(account());
      store.works.insert(
        work("work-1", { log: [firstLog], feedbackHistory: [firstFeedback] }),
      );
      store.snapshots.putWorkSnapshot({
        workId: "work-1",
        day: "2026-01-02",
        totals: { reads: 10 },
      });
      store.works.remove("work-1");
      expect(store.works.get("work-1")).toBeUndefined();
      const db = new DatabaseSync(dbFile, { readOnly: true });
      try {
        expect(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM work_logs WHERE work_id = 'work-1'",
            )
            .get(),
        ).toEqual({ count: 0 });
        expect(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM work_feedback WHERE work_id = 'work-1'",
            )
            .get(),
        ).toEqual({ count: 0 });
        expect(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM work_snapshots WHERE work_id = 'work-1'",
            )
            .get(),
        ).toEqual({ count: 0 });
      } finally {
        db.close();
      }
    });
  });

  it("更新不存在的作品失败且不会改变序号", async () => {
    await withStore((store) => {
      expect(() => store.works.update(work("missing"))).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
      expect(store.meta.version()).toEqual({ seq: 0, snapshotSeq: 0 });
    });
  });
});
