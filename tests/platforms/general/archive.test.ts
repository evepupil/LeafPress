import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GENERAL_WRITE } from "@leafpress/core";
import type { Account, FeedbackEntry, Work } from "@leafpress/core";

import { archiveLink } from "../../../src/platforms/general/archive.js";
import type { CodeStepContext } from "../../../src/platforms/types.js";

let folder = "";

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "leafpress-platform-archive-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function makeWork(input: {
  feedback?: string;
  feedbackHistory?: FeedbackEntry[];
}): Work {
  return {
    id: "work-1",
    title: "示例作品",
    accountId: "blog-1",
    status: "doing",
    brief: "发布作品",
    source: { kind: "none" },
    workflowId: GENERAL_WRITE.id,
    step: 2,
    ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
    feedbackHistory: input.feedbackHistory ?? [],
    order: 1,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    tags: [],
    log: [],
  };
}

function makeContext(work: Work): CodeStepContext {
  const account: Account = {
    id: "blog-1",
    platform: "blog",
    name: "我的博客",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: join(folder, "profile.md"),
    settings: [],
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };
  const step = GENERAL_WRITE.steps[2];
  if (!step) throw new Error("通用写稿的归档步骤不存在");

  return {
    work,
    account,
    workflow: GENERAL_WRITE,
    step,
    folder,
    today: "2026-10-08",
    now: new Date("2026-10-08T12:00:00.000Z"),
    setting: () => undefined,
    secret: () => undefined,
    exec: () =>
      Promise.resolve({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      }),
    heartbeat: () => undefined,
  };
}

describe("archiveLink：通用写稿归档链接", () => {
  it("优先从当前反馈归档链接", async () => {
    const work = makeWork({
      feedback: "已发布：https://example.com/current",
      feedbackHistory: [
        {
          at: "2026-10-07T00:00:00.000Z",
          step: 2,
          stepName: "归档链接",
          text: "https://example.com/old",
        },
      ],
    });

    await expect(archiveLink(makeContext(work))).resolves.toEqual({
      kind: "done",
      url: "https://example.com/current",
      publishedAt: "2026-10-08",
    });
  });

  it("当前反馈不存在时从最后一条历史反馈归档链接", async () => {
    const work = makeWork({
      feedbackHistory: [
        {
          at: "2026-10-06T00:00:00.000Z",
          step: 2,
          stepName: "归档链接",
          text: "旧链接 https://example.com/old",
        },
        {
          at: "2026-10-07T00:00:00.000Z",
          step: 2,
          stepName: "归档链接",
          text: "新链接 https://example.com/latest",
        },
      ],
    });

    await expect(archiveLink(makeContext(work))).resolves.toEqual({
      kind: "done",
      url: "https://example.com/latest",
      publishedAt: "2026-10-08",
    });
  });

  it("链接后紧跟中文标点时只归档网址", async () => {
    const work = makeWork({
      feedback: "发布完成：https://example.com/article，谢谢！",
    });

    await expect(archiveLink(makeContext(work))).resolves.toEqual({
      kind: "done",
      url: "https://example.com/article",
      publishedAt: "2026-10-08",
    });
  });

  it("找不到链接时请求作者补充或先去发布", async () => {
    const work = makeWork({ feedback: "还没有发布", feedbackHistory: [] });

    await expect(archiveLink(makeContext(work))).resolves.toEqual({
      kind: "ask",
      ask: "没在你的反馈里找到链接。把发布后的链接填在下面；还没发就先去发。",
    });
  });
});
