/**
 * 工作流存储（RunStore）的约定测试。
 *
 * 内存实现和 SQLite 实现都必须跑过这一套，保证两边行为一致：
 *   describeRunStoreContract("内存存储", () => createMemoryRunStore());
 *   describeRunStoreContract("SQLite 存储", () => openTestStore().runs);
 * 本文件只被测试文件引用，自身不是测试文件（不以 .test.ts 结尾）。
 */
import { describe, expect, it } from "vitest";

import type {
  RunRecord,
  RunStore,
  StepRecord,
} from "../../src/workflows/types.js";

type StoreFactory = () => RunStore | Promise<RunStore>;

function makeRun(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    workflowId: "demo",
    params: { ref: "zh/hello", nested: { list: [1, 2, 3] } },
    state: "running",
    cursor: 0,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeSteps(runId: string): StepRecord[] {
  return ["first", "second", "third"].map((stepId, index) => ({
    runId,
    stepId,
    index,
    status: "pending",
    inputHashes: {},
    attempts: 0,
  }));
}

export function describeRunStoreContract(
  name: string,
  createStore: StoreFactory,
): void {
  describe(`${name}：工作流存储约定`, () => {
    it("创建后能原样读回运行和步骤", async () => {
      const store = await createStore();
      const run = makeRun("r1");
      store.createRun(run, makeSteps("r1"));

      expect(store.getRun("r1")).toEqual(run);
      const steps = store.getSteps("r1");
      expect(steps.map((s) => s.stepId)).toEqual(["first", "second", "third"]);
      expect(
        steps.every((s) => s.status === "pending" && s.attempts === 0),
      ).toBe(true);
    });

    it("读不存在的运行返回 undefined，步骤返回空数组", async () => {
      const store = await createStore();
      expect(store.getRun("missing")).toBeUndefined();
      expect(store.getSteps("missing")).toEqual([]);
    });

    it("列表按创建时间倒序，并能按状态筛选", async () => {
      const store = await createStore();
      store.createRun(
        makeRun("old", { createdAt: "2026-10-01T00:00:00.000Z" }),
        makeSteps("old"),
      );
      store.createRun(
        makeRun("new", {
          createdAt: "2026-10-03T00:00:00.000Z",
          state: "waiting",
        }),
        makeSteps("new"),
      );
      store.createRun(
        makeRun("mid", {
          createdAt: "2026-10-02T00:00:00.000Z",
          state: "completed",
        }),
        makeSteps("mid"),
      );

      expect(store.listRuns().map((r) => r.id)).toEqual(["new", "mid", "old"]);
      expect(
        store.listRuns({ states: ["waiting", "running"] }).map((r) => r.id),
      ).toEqual(["new", "old"]);
    });

    it("状态匹配时比较并交换成功，同时应用补丁并更新时间", async () => {
      const store = await createStore();
      store.createRun(
        makeRun("r1", { state: "waiting", error: "旧错误" }),
        makeSteps("r1"),
      );

      const ok = store.transitionRun("r1", ["waiting", "failed"], "running", {
        cursor: 2,
        error: null,
      });

      expect(ok).toBe(true);
      const run = store.getRun("r1");
      expect(run?.state).toBe("running");
      expect(run?.cursor).toBe(2);
      expect(run?.error).toBeUndefined();
      expect(run?.updatedAt).not.toBe("2026-10-05T00:00:00.000Z");
    });

    it("状态不匹配时比较并交换失败，并且什么都不改", async () => {
      const store = await createStore();
      const original = makeRun("r1", { state: "running", cursor: 1 });
      store.createRun(original, makeSteps("r1"));

      const ok = store.transitionRun("r1", ["waiting", "failed"], "running", {
        cursor: 5,
      });

      expect(ok).toBe(false);
      expect(store.getRun("r1")).toEqual(original);
    });

    it("同一次运行连续两次比较并交换，只有第一次成功", async () => {
      const store = await createStore();
      store.createRun(makeRun("r1", { state: "waiting" }), makeSteps("r1"));

      expect(store.transitionRun("r1", ["waiting"], "running")).toBe(true);
      expect(store.transitionRun("r1", ["waiting"], "running")).toBe(false);
    });

    it("对不存在的运行比较并交换返回 false", async () => {
      const store = await createStore();
      expect(store.transitionRun("missing", ["waiting"], "running")).toBe(
        false,
      );
    });

    it("updateRun 能改状态、游标，并能用 null 清空错误", async () => {
      const store = await createStore();
      store.createRun(makeRun("r1"), makeSteps("r1"));

      store.updateRun("r1", { state: "failed", error: "第二步失败" });
      expect(store.getRun("r1")?.error).toBe("第二步失败");

      store.updateRun("r1", { state: "waiting", cursor: 1, error: null });
      const run = store.getRun("r1");
      expect(run?.state).toBe("waiting");
      expect(run?.cursor).toBe(1);
      expect(run?.error).toBeUndefined();
    });

    it("updateStep 能写入嵌套数据，也能用 null 清空", async () => {
      const store = await createStore();
      store.createRun(makeRun("r1"), makeSteps("r1"));

      store.updateStep("r1", "second", {
        status: "waiting",
        attempts: 1,
        inputHashes: { "C:\\runs\\r1\\draft.md": "abc123" },
        outputs: {
          draftPath: "C:\\runs\\r1\\draft.md",
          stats: { chars: 1200 },
        },
        wait: {
          kind: "ai",
          message: "请按任务文件改写",
          taskFile: "C:\\runs\\r1\\second\\task.md",
          outputFile: "C:\\runs\\r1\\second\\output.md",
          choices: [{ id: "q1", label: "问题一", detail: "浏览 1 万" }],
        },
        error: "上一次超时",
        startedAt: "2026-10-05T01:00:00.000Z",
      });

      const waiting = store.getSteps("r1")[1];
      expect(waiting?.status).toBe("waiting");
      expect(waiting?.attempts).toBe(1);
      expect(waiting?.inputHashes).toEqual({
        "C:\\runs\\r1\\draft.md": "abc123",
      });
      expect(waiting?.outputs).toEqual({
        draftPath: "C:\\runs\\r1\\draft.md",
        stats: { chars: 1200 },
      });
      expect(waiting?.wait?.choices?.[0]?.label).toBe("问题一");
      expect(waiting?.error).toBe("上一次超时");
      expect(waiting?.startedAt).toBe("2026-10-05T01:00:00.000Z");

      store.updateStep("r1", "second", {
        status: "pending",
        outputs: null,
        wait: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        inputHashes: {},
      });

      const reset = store.getSteps("r1")[1];
      expect(reset?.status).toBe("pending");
      expect(reset?.outputs).toBeUndefined();
      expect(reset?.wait).toBeUndefined();
      expect(reset?.error).toBeUndefined();
      expect(reset?.startedAt).toBeUndefined();
      expect(reset?.inputHashes).toEqual({});
      expect(reset?.attempts).toBe(1);
    });

    it("步骤按序号升序返回，只改指定的那一步", async () => {
      const store = await createStore();
      store.createRun(makeRun("r1"), makeSteps("r1"));

      store.updateStep("r1", "third", { status: "done" });

      const steps = store.getSteps("r1");
      expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
      expect(steps.map((s) => s.status)).toEqual([
        "pending",
        "pending",
        "done",
      ]);
    });
  });
}
