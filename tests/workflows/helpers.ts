import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

import { createWorkflowEngine } from "../../src/workflows/engine.js";
import { createMemoryRunStore } from "../../src/workflows/memory-store.js";
import type {
  StepContext,
  StepDefinition,
  StepOutcome,
  WorkflowDefinition,
  WorkflowParams,
} from "../../src/workflows/types.js";

const temporaryDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.clear();
});

export type StepRun = (
  context: StepContext,
) => StepOutcome | Promise<StepOutcome>;

export function makeStep(
  id: string,
  run: StepRun,
  options: {
    readonly kind?: StepDefinition["kind"];
    readonly inputFiles?: StepDefinition["inputFiles"];
  } = {},
): StepDefinition {
  return {
    id,
    title: id,
    kind: options.kind ?? "code",
    inputFiles: options.inputFiles ?? (() => []),
    run: (context) => Promise.resolve(run(context)),
  };
}

export function makeWorkflow(
  steps: readonly StepDefinition[],
  options: {
    readonly id?: string;
    readonly parseParams?: (raw: unknown) => WorkflowParams;
  } = {},
): WorkflowDefinition {
  return {
    id: options.id ?? "demo",
    title: "测试工作流",
    parseParams: options.parseParams ?? (() => ({})),
    steps,
  };
}

export async function makeHarness(
  workflows: readonly WorkflowDefinition[],
  options: {
    readonly epoch?: number;
    readonly leaseMs?: number;
    readonly maxRewinds?: number;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-workflow-"));
  temporaryDirectories.add(directory);
  let time = options.epoch ?? Date.parse("2026-10-05T12:00:00.000Z");
  let runNumber = 0;
  let ownerNumber = 0;
  const ownerTokens: string[] = [];
  const now = () => new Date(time);
  const store = createMemoryRunStore({ now });
  const createEngine = (
    definitions: readonly WorkflowDefinition[] = workflows,
  ) =>
    createWorkflowEngine({
      store,
      workflows: definitions,
      runsDir: directory,
      now,
      newRunId: () => `run-${++runNumber}`,
      newOwnerToken: () => {
        const owner = `owner-${++ownerNumber}`;
        ownerTokens.push(owner);
        return owner;
      },
      leaseMs: options.leaseMs ?? 1_000,
      maxRewinds: options.maxRewinds ?? 20,
    });

  return {
    directory,
    store,
    engine: createEngine(),
    createEngine,
    ownerTokens,
    now,
    setTime(value: number | Date) {
      time = value instanceof Date ? value.getTime() : value;
    },
    advance(milliseconds: number) {
      time += milliseconds;
    },
  };
}

export function done(
  outputs: Readonly<Record<string, unknown>> = {},
): StepOutcome {
  return { type: "done", outputs };
}
