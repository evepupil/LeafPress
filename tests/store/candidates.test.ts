import type { CandidateKind, IdeaCandidate } from "@leafpress/core";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { withStore } from "./helpers.js";

const TIME = "2026-10-19T07:30:00+08:00";

function candidate(
  id: string,
  overrides: Partial<IdeaCandidate> = {},
): IdeaCandidate {
  return {
    id,
    key: `zq:${id}`,
    kind: "question",
    title: `问题 ${id}`,
    url: `https://www.zhihu.com/question/${id}`,
    score: 10,
    state: "new",
    payload: {
      kind: "question",
      questionId: id,
      via: ["personal"],
      topics: [],
      blogWorkIds: [],
      answerSummaries: [],
      relatedWorkIds: [],
    },
    firstSeenAt: TIME,
    updatedAt: TIME,
    ...overrides,
  };
}

function otherKindCandidate(
  id: string,
  kind: Exclude<CandidateKind, "question">,
  score: number,
): IdeaCandidate {
  if (kind === "followup") {
    return candidate(id, {
      key: `wf:${id}`,
      kind,
      score,
      payload: {
        kind,
        workId: id,
        platform: "blog",
        reach: 1000,
        growth: score,
        interactions: null,
      },
    });
  }
  return candidate(id, {
    key: `dev:${id}:2026-W43`,
    kind,
    score,
    payload: {
      kind,
      repo: id,
      path: `C:/code/${id}`,
      week: "2026-W43",
      commits: ["修复记录库"],
      logs: [{ file: "2026-10-19.md", headings: ["完成候选池"] }],
    },
  });
}

describe("灵感候选 Repo", () => {
  it("按 kind、分数和编号排序，并支持按状态和各类键查找", async () => {
    await withStore((store) => {
      const suggested = candidate("q-a", {
        score: 12,
        state: "suggested",
        ideaId: "idea-1",
      });
      const question = candidate("q-z", { score: 12 });
      const lowQuestion = candidate("q-low", { score: 8 });
      const followup = otherKindCandidate("work-1", "followup", 1000);
      const devlog = otherKindCandidate("repo-1", "devlog", 1);
      const skipped = candidate("q-skipped", { state: "skipped", score: 99 });
      for (const row of [
        suggested,
        question,
        lowQuestion,
        followup,
        devlog,
        skipped,
      ]) {
        store.candidates.insert(row);
      }

      expect(store.candidates.get("q-a")).toEqual(suggested);
      expect(store.candidates.getByKey("zq:q-a")).toEqual(suggested);
      expect(store.candidates.getByIdea("idea-1")).toEqual(suggested);
      expect(store.candidates.get("missing")).toBeUndefined();
      expect(store.candidates.getByKey("missing")).toBeUndefined();
      expect(store.candidates.getByIdea("missing")).toBeUndefined();
      expect(store.candidates.list().map((row) => row.id)).toEqual([
        "q-skipped",
        "q-a",
        "q-z",
        "q-low",
        "work-1",
        "repo-1",
      ]);
      expect(
        store.candidates.list({ state: ["new"] }).map((row) => row.id),
      ).toEqual(["q-z", "q-low", "work-1", "repo-1"]);
      expect(store.candidates.list({ state: [] })).toEqual([]);
    });
  });

  it("get 保留缺省发布时间的续写与空 logs 的开发记录字段", async () => {
    await withStore((store) => {
      const followup: IdeaCandidate = {
        id: "work-no-published-at",
        key: "wf:work-no-published-at",
        kind: "followup",
        title: "未填写发布时间的续写",
        url: "https://example.test/works/work-no-published-at",
        score: 90,
        state: "new",
        payload: {
          kind: "followup",
          workId: "work-42",
          platform: "blog",
          reach: 1200,
          growth: 80,
          interactions: null,
        },
        firstSeenAt: TIME,
        updatedAt: TIME,
      };
      const devlog: IdeaCandidate = {
        id: "repo-empty-logs",
        key: "dev:repo-empty:2026-W43",
        kind: "devlog",
        title: "没有日志的开发记录",
        score: 5,
        state: "new",
        payload: {
          kind: "devlog",
          repo: "repo",
          path: "C:/code/repo",
          week: "2026-W43",
          commits: ["commit-1"],
          logs: [],
        },
        firstSeenAt: TIME,
        updatedAt: TIME,
      };
      store.candidates.insert(followup);
      store.candidates.insert(devlog);

      expect(store.candidates.get(followup.id)).toEqual({
        id: "work-no-published-at",
        key: "wf:work-no-published-at",
        kind: "followup",
        title: "未填写发布时间的续写",
        url: "https://example.test/works/work-no-published-at",
        score: 90,
        state: "new",
        payload: {
          kind: "followup",
          workId: "work-42",
          platform: "blog",
          reach: 1200,
          growth: 80,
          interactions: null,
        },
        firstSeenAt: TIME,
        updatedAt: TIME,
      });
      expect(store.candidates.get(devlog.id)).toEqual({
        id: "repo-empty-logs",
        key: "dev:repo-empty:2026-W43",
        kind: "devlog",
        title: "没有日志的开发记录",
        score: 5,
        state: "new",
        payload: {
          kind: "devlog",
          repo: "repo",
          path: "C:/code/repo",
          week: "2026-W43",
          commits: ["commit-1"],
          logs: [],
        },
        firstSeenAt: TIME,
        updatedAt: TIME,
      });
    });
  });

  it("ideaId 唯一，冲突插入或更新失败且不递增变更序号", async () => {
    await withStore((store) => {
      const first = candidate("q-idea-first", { ideaId: "idea-unique" });
      store.candidates.insert(first);
      const beforeInsertConflict = store.meta.version();
      expect(beforeInsertConflict).toEqual({ seq: 1, snapshotSeq: 0 });

      expect(() =>
        store.candidates.insert(
          candidate("q-idea-second", { ideaId: "idea-unique" }),
        ),
      ).toThrow(expect.objectContaining({ code: "STORE_FAILED" }));
      expect(store.meta.version()).toEqual(beforeInsertConflict);
      expect(store.candidates.get("q-idea-second")).toBeUndefined();
      expect(store.candidates.getByIdea("idea-unique")).toEqual(first);

      const unlinked = candidate("q-idea-update");
      store.candidates.insert(unlinked);
      const beforeUpdateConflict = store.meta.version();
      expect(() =>
        store.candidates.update({ ...unlinked, ideaId: "idea-unique" }),
      ).toThrow(expect.objectContaining({ code: "STORE_FAILED" }));
      expect(store.meta.version()).toEqual(beforeUpdateConflict);
      expect(store.candidates.get(unlinked.id)).toEqual(unlinked);
    });
  });

  it("删除候选；删除后 id 和 key 均不可查，重复删除不递增变更序号", async () => {
    await withStore((store) => {
      const missingBefore = store.meta.version();
      expect(() => store.candidates.remove("missing")).not.toThrow();
      expect(store.meta.version()).toEqual(missingBefore);

      const row = candidate("q-remove");
      store.candidates.insert(row);
      const beforeRemove = store.meta.version();
      store.candidates.remove(row.id);
      expect(store.candidates.get(row.id)).toBeUndefined();
      expect(store.candidates.getByKey(row.key)).toBeUndefined();
      expect(store.meta.version()).toEqual({
        seq: beforeRemove.seq + 1,
        snapshotSeq: beforeRemove.snapshotSeq,
      });

      const afterRemove = store.meta.version();
      expect(() => store.candidates.remove(row.id)).not.toThrow();
      expect(store.meta.version()).toEqual(afterRemove);
    });
  });

  it("更新状态和 ideaId，但不改候选 key；不存在的记录不能更新", async () => {
    await withStore((store) => {
      const original = candidate("q-update");
      store.candidates.insert(original);
      const updated = {
        ...original,
        key: "ignored-key",
        state: "suggested" as const,
        ideaId: "idea-42",
        updatedAt: "2026-10-20T07:30:00+08:00",
      };
      store.candidates.update(updated);

      expect(store.candidates.get("q-update")).toEqual({
        ...updated,
        key: original.key,
      });
      expect(store.candidates.getByKey(original.key)?.ideaId).toBe("idea-42");
      expect(store.candidates.getByKey("ignored-key")).toBeUndefined();
      expect(() => store.candidates.update(candidate("missing"))).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
    });
  });

  it("候选 key 重复时抛 STORE_FAILED，写入会递增变更序号", async () => {
    await withStore((store) => {
      expect(store.meta.nextSerial("candidate")).toBe(1);
      expect(store.meta.version()).toEqual({ seq: 1, snapshotSeq: 0 });
      const row = candidate("q-duplicate", { key: "zq:same" });
      store.candidates.insert(row);
      expect(store.meta.version()).toEqual({ seq: 2, snapshotSeq: 0 });
      expect(() =>
        store.candidates.insert(candidate("q-duplicate-2", { key: "zq:same" })),
      ).toThrow(expect.objectContaining({ code: "STORE_FAILED" }));
      expect(store.meta.version()).toEqual({ seq: 2, snapshotSeq: 0 });
    });
  });

  it("读取非法 JSON 或 payload kind 与行不一致时抛 STORE_FAILED", async () => {
    await withStore((store, dbFile) => {
      store.candidates.insert(candidate("q-invalid-json"));
      store.candidates.insert(candidate("q-invalid-kind"));
      const db = new DatabaseSync(dbFile);
      try {
        db.prepare("UPDATE idea_candidates SET payload = ? WHERE id = ?").run(
          "not-json",
          "q-invalid-json",
        );
        db.prepare("UPDATE idea_candidates SET payload = ? WHERE id = ?").run(
          JSON.stringify({ kind: "devlog" }),
          "q-invalid-kind",
        );
      } finally {
        db.close();
      }

      expect(() => store.candidates.get("q-invalid-json")).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
      expect(() => store.candidates.get("q-invalid-kind")).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
    });
  });
});
