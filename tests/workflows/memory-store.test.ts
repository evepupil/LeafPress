import { expect, it } from "vitest";

import type { RunRecord, StepRecord } from "../../src/workflows/types.js";
import { createMemoryRunStore } from "../../src/workflows/memory-store.js";
import { describeRunStoreContract } from "../contracts/run-store.contract.js";

describeRunStoreContract("内存存储", () => createMemoryRunStore());

it("步骤创建输入、getSteps 和 listRuns 都通过深拷贝隔离", () => {
  const store = createMemoryRunStore();
  const run: RunRecord = {
    id: "copies",
    workflowId: "demo",
    params: { nested: { value: "原始参数" } },
    state: "running",
    cursor: 0,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
  };
  const step: StepRecord = {
    runId: "copies",
    stepId: "step",
    index: 0,
    status: "done",
    inputHashes: { path: "hash" },
    outputs: { nested: { value: "原始输出" } },
    attempts: 1,
  };
  store.createRun(run, [step]);

  (step.outputs?.nested as { value: string }).value = "创建后修改";
  expect(
    (store.getSteps("copies")[0]?.outputs?.nested as { value: string }).value,
  ).toBe("原始输出");

  const returnedSteps = store.getSteps("copies");
  (returnedSteps[0]?.outputs?.nested as { value: string }).value = "读取后修改";
  expect(
    (store.getSteps("copies")[0]?.outputs?.nested as { value: string }).value,
  ).toBe("原始输出");

  const returnedRuns = store.listRuns();
  (returnedRuns[0]?.params.nested as { value: string }).value = "列表后修改";
  expect((store.listRuns()[0]?.params.nested as { value: string }).value).toBe(
    "原始参数",
  );
});

it("新建、补丁和读取的嵌套数据彼此隔离", () => {
  const store = createMemoryRunStore({
    now: () => new Date("2026-10-05T12:00:00.000Z"),
  });
  const run = {
    id: "copy",
    workflowId: "demo",
    params: { nested: { value: "原始值" } },
    state: "running" as const,
    cursor: 0,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
  };
  const steps = [
    {
      runId: "copy",
      stepId: "step",
      index: 0,
      status: "pending" as const,
      inputHashes: {},
      attempts: 0,
    },
  ];
  store.createRun(run, steps);
  run.params.nested.value = "创建后修改";
  const returned = store.getRun("copy");
  if (!returned) throw new Error("运行记录应存在");
  (returned.params.nested as { value: string }).value = "读取后修改";
  expect((store.getRun("copy")?.params.nested as { value: string }).value).toBe(
    "原始值",
  );

  const outputs = { nested: { value: "补丁原始值" } };
  store.updateStep("copy", "step", { outputs });
  outputs.nested.value = "补丁后修改";
  expect(
    (store.getSteps("copy")[0]?.outputs?.nested as { value: string }).value,
  ).toBe("补丁原始值");
});
