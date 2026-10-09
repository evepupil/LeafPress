import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  apiRequest,
  createM1Environment,
  parseJson,
  runCli,
} from "./fixtures/m1-process.js";

interface Work {
  id: string;
  status: string;
  step: number;
  ask?: string;
}

interface TaskState {
  status: string;
  step: number;
  ask?: string;
  feedback?: string;
  url?: string;
}

interface Started {
  detail: { work: Work } | null;
  lease?: { token: string };
}

interface Bootstrap {
  works: Work[];
}

function expectCliOk(result: ReturnType<typeof runCli>): void {
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

function must<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null) throw new Error(`缺少 ${name}`);
  return value;
}

async function assertMirrorMatchesApi(
  environment: Awaited<ReturnType<typeof createM1Environment>>,
  workId: string,
  expected: { status: string; step: number },
): Promise<TaskState> {
  const folder = join(environment.home, "tasks", workId);
  const state = JSON.parse(
    await readFile(join(folder, "状态.json"), "utf8"),
  ) as TaskState;
  const response = await apiRequest<Bootstrap>(environment, "/api/bootstrap");
  expect(response.status).toBe(200);
  const work = response.body.works.find((item) => item.id === workId);
  expect(work).toMatchObject(expected);
  expect(state).toMatchObject(expected);
  expect(state).toMatchObject({ status: work?.status, step: work?.step });
  return state;
}

describe("M1 任务文件夹镜像与归档步骤", () => {
  it("状态和步骤始终同步；无链接时等待，补充反馈后完成且反馈文件累积", async () => {
    const environment = await createM1Environment(true);
    try {
      const accountCommand = runCli(environment.home, [
        "account",
        "add",
        "--platform",
        "bilibili",
        "--name",
        "任务目录账号",
      ]);
      expectCliOk(accountCommand);
      const accountId = parseJson<{ account: { id: string } }>(
        accountCommand.stdout,
      ).account.id;

      const createCommand = runCli(environment.home, [
        "work",
        "new",
        "--account",
        accountId,
        "--title",
        "缺少归档链接的作品",
      ]);
      expectCliOk(createCommand);
      const workId = must(
        parseJson<{ works: Work[] }>(createCommand.stdout).works[0]?.id,
        "作品编号",
      );
      const folder = join(environment.home, "tasks", workId);
      const askFile = join(folder, "要你做的事.md");
      const feedbackFile = join(folder, "你的反馈.md");
      await assertMirrorMatchesApi(environment, workId, {
        status: "todo",
        step: 0,
      });

      const firstStart = runCli(environment.home, ["work", "next"]);
      expectCliOk(firstStart);
      const firstToken = must(
        parseJson<Started>(firstStart.stdout).lease?.token,
        "首次令牌",
      );
      await assertMirrorMatchesApi(environment, workId, {
        status: "doing",
        step: 0,
      });

      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "稿子.md"), "# 草稿\n正文\n", "utf8");
      const step = runCli(environment.home, [
        "work",
        "step",
        workId,
        "--lease",
        firstToken,
      ]);
      expectCliOk(step);
      const waiting = await assertMirrorMatchesApi(environment, workId, {
        status: "waiting",
        step: 1,
      });
      expect(waiting.ask).toContain(folder);
      expect(existsSync(askFile)).toBe(true);
      expect(await readFile(askFile, "utf8")).toContain(folder);

      const firstFeedback = "已经发布，但忘了复制链接。";
      const submittedFirst = await apiRequest(
        environment,
        `/api/works/${workId}/feedback`,
        {
          method: "POST",
          body: { text: firstFeedback },
        },
      );
      expect(submittedFirst.status).toBe(200);
      const todoAfterFirst = await assertMirrorMatchesApi(environment, workId, {
        status: "todo",
        step: 1,
      });
      expect(todoAfterFirst.feedback).toBe(firstFeedback);
      expect(existsSync(askFile)).toBe(false);
      expect(await readFile(feedbackFile, "utf8")).toContain(firstFeedback);

      const secondStart = runCli(environment.home, ["work", "next"]);
      expectCliOk(secondStart);
      const secondToken = must(
        parseJson<Started>(secondStart.stdout).lease?.token,
        "归档步骤令牌",
      );
      const coding = await assertMirrorMatchesApi(environment, workId, {
        status: "doing",
        step: 2,
      });
      expect(coding.feedback).toBe(firstFeedback);

      const missingUrlRun = runCli(environment.home, [
        "work",
        "run",
        workId,
        "--lease",
        secondToken,
      ]);
      expectCliOk(missingUrlRun);
      const waitingForUrl = await assertMirrorMatchesApi(environment, workId, {
        status: "waiting",
        step: 2,
      });
      expect(waitingForUrl.ask).toContain("没在你的反馈里找到链接");
      expect(existsSync(askFile)).toBe(true);
      expect(await readFile(askFile, "utf8")).toContain(
        "没在你的反馈里找到链接",
      );

      const link = "https://www.bilibili.com/video/BV1folder77";
      const secondFeedback = `补充发布链接：${link}`;
      const submittedSecond = await apiRequest(
        environment,
        `/api/works/${workId}/feedback`,
        {
          method: "POST",
          body: { text: secondFeedback },
        },
      );
      expect(submittedSecond.status).toBe(200);
      const todoAfterSecond = await assertMirrorMatchesApi(
        environment,
        workId,
        { status: "todo", step: 2 },
      );
      expect(todoAfterSecond.feedback).toBe(secondFeedback);
      expect(existsSync(askFile)).toBe(false);
      const accumulatedFeedback = await readFile(feedbackFile, "utf8");
      expect(accumulatedFeedback).toContain(firstFeedback);
      expect(accumulatedFeedback).toContain(secondFeedback);

      const finalStart = runCli(environment.home, ["work", "next"]);
      expectCliOk(finalStart);
      const finalToken = must(
        parseJson<Started>(finalStart.stdout).lease?.token,
        "最终令牌",
      );
      await assertMirrorMatchesApi(environment, workId, {
        status: "doing",
        step: 2,
      });
      const finalRun = runCli(environment.home, [
        "work",
        "run",
        workId,
        "--lease",
        finalToken,
      ]);
      expectCliOk(finalRun);
      const done = await assertMirrorMatchesApi(environment, workId, {
        status: "done",
        step: 3,
      });
      expect(done.url).toBe(link);
      expect(existsSync(askFile)).toBe(false);
      const finalFeedback = await readFile(feedbackFile, "utf8");
      expect(finalFeedback).toContain(firstFeedback);
      expect(finalFeedback).toContain(secondFeedback);
    } finally {
      await environment.close();
    }
  }, 90_000);
});
