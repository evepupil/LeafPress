import type {
  Account,
  Bootstrap,
  Idea,
  ImportSummary,
  MetricsDataset,
  UseCases,
  Version,
  WeeklyNote,
  Work,
  WorkDetail,
} from "@leafpress/core";
import { GENERAL_WRITE, PLATFORMS } from "@leafpress/core";
import { vi } from "vitest";

export type FakeUseCases = {
  [Key in keyof UseCases]: (
    ...args: Parameters<UseCases[Key]>
  ) => ReturnType<UseCases[Key]>;
};

export const versionFixture: Version = {
  seq: 7,
  snapshotSeq: 3,
  profilesStamp: 5,
};

export const accountFixture: Account = {
  id: "zhihu-1",
  platform: "zhihu",
  name: "测试账号",
  stage: "active",
  since: "2026-01-01",
  profile: "",
  profilePath: "/tmp/profile.md",
  settings: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

export const ideaFixture: Idea = {
  id: "idea-1",
  text: "测试灵感",
  detail: "",
  status: "inbox",
  source: "quick",
  order: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  workIds: [],
};

export const workFixture: Work = {
  id: "work-1",
  title: "测试作品",
  accountId: accountFixture.id,
  status: "todo",
  brief: "测试要求",
  source: { kind: "idea", ideaId: ideaFixture.id },
  workflowId: GENERAL_WRITE.id,
  step: 0,
  feedbackHistory: [],
  order: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  tags: [],
  log: [],
};

export const workDetailFixture: WorkDetail = {
  work: workFixture,
  account: accountFixture,
  platform: PLATFORMS.zhihu,
  workflow: GENERAL_WRITE,
  folder: "/tmp/tasks/work-1",
  files: [],
  missing: [],
  context: "测试上下文",
};

export const bootstrapFixture: Bootstrap = {
  now: "2026-01-01T00:00:00Z",
  today: "2026-01-01",
  version: versionFixture,
  paths: {
    home: "/tmp/home",
    tasks: "/tmp/home/tasks",
    accounts: "/tmp/home/accounts",
    backups: "/tmp/home/backups",
  },
  works: [workFixture],
  ideas: [ideaFixture],
  accounts: [accountFixture],
  pulls: [],
  notes: [],
  schedules: [],
};

export const datasetFixture: MetricsDataset = {
  today: "2026-01-01",
  latestDay: "2025-12-31",
  daily: {},
  lastDays: {},
  workDays: {},
};

export const noteFixture: WeeklyNote = {
  week: "2025-12-29",
  wins: "",
  improve: "",
  next: "",
  updatedAt: "2026-01-01T00:00:00Z",
};

export const importSummaryFixture: ImportSummary = {
  added: 0,
  skipped: 0,
  drafts: 0,
  issues: [],
  works: [],
};

export function createFakeUseCases(): FakeUseCases {
  const unused = (): never => {
    throw new Error("调用了本测试不预期的用例。");
  };
  return {
    listWorks: vi.fn(() => [workFixture]),
    showWork: vi.fn(() => workDetailFixture),
    createWorks: vi.fn(() => [workFixture]),
    updateWork: vi.fn(() => workFixture),
    moveWork: vi.fn(() => workFixture),
    submitFeedback: vi.fn(() => workFixture),
    deleteWork: vi.fn(() => undefined),
    openWorkFolder: vi.fn(() => Promise.resolve(workDetailFixture.folder)),
    readWorkFile: vi.fn(() => ({
      contentType: "text/html; charset=utf-8",
      body: Buffer.from("<p>复制页</p>", "utf8"),
    })),
    startWork: vi.fn(unused),
    startNext: vi.fn(unused),
    stepWork: vi.fn(unused),
    runWork: vi.fn(unused),
    backWork: vi.fn(unused),
    releaseWork: vi.fn(unused),
    listIdeas: vi.fn(() => [ideaFixture]),
    addIdeas: vi.fn(() => [ideaFixture]),
    updateIdea: vi.fn(() => ideaFixture),
    moveIdea: vi.fn(() => ideaFixture),
    deleteIdea: vi.fn(() => undefined),
    gatherIdeas: vi.fn(() => Promise.resolve({ sources: [], pool: [] })),
    listCandidates: vi.fn(() => []),
    skipCandidates: vi.fn(() => []),
    listAccounts: vi.fn(() => [accountFixture]),
    showAccount: vi.fn(unused),
    addAccount: vi.fn(() => accountFixture),
    updateAccount: vi.fn(() => accountFixture),
    saveProfile: vi.fn(() => accountFixture),
    setSetting: vi.fn(() => accountFixture),
    importPosts: vi.fn(() => Promise.resolve(importSummaryFixture)),
    pullData: vi.fn(() => Promise.resolve({ outcomes: [], note: "全部入库" })),
    dataset: vi.fn(() => datasetFixture),
    saveNote: vi.fn(() => noteFixture),
    bootstrap: vi.fn(() => bootstrapFixture),
    version: vi.fn(() => versionFixture),
    exportBackup: vi.fn(() => ({ dir: "/tmp/home/backups/export" })),
  };
}
