import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  apiRequest,
  createM1Environment,
  getVersion,
  parseJson,
  runCli,
} from "./fixtures/m1-process.js";

interface Work {
  id: string;
  status: string;
  step: number;
  order: number;
  url?: string;
  ask?: string;
}

interface Started {
  detail: { work: Work } | null;
  lease?: { token: string };
}

interface Bootstrap {
  works: Work[];
}

interface WorkDetail {
  work: Work;
  context: string;
}

function expectCliOk(result: ReturnType<typeof runCli>): void {
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  expect(result.timedOut).not.toBe(true);
}

function must<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null) throw new Error(`缺少 ${name}`);
  return value;
}

describe("M1 网页与 agent 外部协作", () => {
  it("serve --json 的第一行是完整启动 JSON", async () => {
    const environment = await createM1Environment(true);
    try {
      const firstLine = must(environment.serverFirstLine, "serve 标准输出首行");
      const startup = parseJson<{ ok: boolean; url: string }>(firstLine);
      expect(startup.ok).toBe(true);
      expect(startup.url).toBe(environment.baseUrl);
    } finally {
      await environment.close();
    }
  }, 30_000);

  it("HTTP 建灵感和作品，CLI 推进，反馈后归档；每次业务变更都推进 seq", async () => {
    const environment = await createM1Environment(true);
    try {
      let previousSeq = (await getVersion(environment)).seq;
      const assertSequenceAdvanced = async (): Promise<void> => {
        const version = await getVersion(environment);
        expect(version.seq).toBeGreaterThan(previousSeq);
        previousSeq = version.seq;
      };

      const accountCommand = runCli(environment.home, [
        "account",
        "add",
        "--platform",
        "bilibili",
        "--name",
        "协作账号",
      ]);
      expectCliOk(accountCommand);
      const account = parseJson<{ account: { id: string } }>(
        accountCommand.stdout,
      ).account;
      expect(account.id).toBe("bilibili-1");
      await assertSequenceAdvanced();

      const ideaResponse = await apiRequest<{ idea: { id: string } }>(
        environment,
        "/api/ideas",
        {
          method: "POST",
          body: {
            text: "从网页加入的灵感",
            detail: "完整协作流程",
            source: "quick",
          },
        },
      );
      expect(ideaResponse.status).toBe(200);
      const ideaId = ideaResponse.body.idea.id;
      await assertSequenceAdvanced();

      const created = await apiRequest<{ works: Work[] }>(
        environment,
        "/api/works",
        {
          method: "POST",
          body: {
            source: { kind: "idea", ideaId },
            accountIds: [account.id],
            brief: "按灵感写成一篇文章",
          },
        },
      );
      expect(created.status).toBe(200);
      const workId = must(created.body.works[0]?.id, "转出的作品编号");
      await assertSequenceAdvanced();

      const tail = await apiRequest<{ works: Work[] }>(
        environment,
        "/api/works",
        {
          method: "POST",
          body: {
            source: { kind: "new", title: "队列中的后续作品" },
            accountIds: [account.id],
            brief: "排在目标作品之后",
          },
        },
      );
      expect(tail.status).toBe(200);
      await assertSequenceAdvanced();

      const startedCommand = runCli(environment.home, ["work", "next"]);
      expectCliOk(startedCommand);
      const started = parseJson<Started>(startedCommand.stdout);
      expect(started.detail?.work.id).toBe(workId);
      const token = must(started.lease?.token, "agent 租约令牌");
      await assertSequenceAdvanced();

      const folder = join(environment.home, "tasks", workId);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "稿子.md"), "# 已完成的文章草稿\n", "utf8");
      const stepCommand = runCli(environment.home, [
        "work",
        "step",
        workId,
        "--lease",
        token,
      ]);
      expectCliOk(stepCommand);
      await assertSequenceAdvanced();

      const waiting = await apiRequest<Bootstrap>(
        environment,
        "/api/bootstrap",
      );
      expect(waiting.status).toBe(200);
      const waitingWork = waiting.body.works.find((work) => work.id === workId);
      expect(waitingWork).toMatchObject({ status: "waiting", step: 1 });
      expect(waitingWork?.ask).toContain(folder);

      const feedback = await apiRequest(
        environment,
        `/api/works/${workId}/feedback`,
        {
          method: "POST",
          body: { text: "已经发布：https://www.bilibili.com/video/BV1collab1" },
        },
      );
      expect(feedback.status).toBe(200);
      await assertSequenceAdvanced();

      const queueCommand = runCli(environment.home, ["works"]);
      expectCliOk(queueCommand);
      const queue = parseJson<{ works: Work[] }>(queueCommand.stdout).works;
      const todo = queue.filter((work) => work.status === "todo");
      expect(todo[0]?.id).toBe(workId);

      const restartedCommand = runCli(environment.home, ["work", "next"]);
      expectCliOk(restartedCommand);
      const restarted = parseJson<Started>(restartedCommand.stdout);
      expect(restarted.detail?.work.id).toBe(workId);
      const newToken = must(restarted.lease?.token, "续做租约令牌");
      await assertSequenceAdvanced();

      const runCommand = runCli(environment.home, [
        "work",
        "run",
        workId,
        "--lease",
        newToken,
      ]);
      expectCliOk(runCommand);
      await assertSequenceAdvanced();

      const done = await apiRequest<Bootstrap>(environment, "/api/bootstrap");
      const completed = done.body.works.find((work) => work.id === workId);
      expect(completed).toMatchObject({
        status: "done",
        url: "https://www.bilibili.com/video/BV1collab1",
      });
      const detail = await apiRequest<WorkDetail>(
        environment,
        `/api/works/${workId}`,
      );
      expect(detail.body.work.status).toBe("done");
    } finally {
      await environment.close();
    }
  }, 60_000);

  it("作者挪回待实现后，旧令牌不能再推进作品", async () => {
    const environment = await createM1Environment(true);
    try {
      const accountCommand = runCli(environment.home, [
        "account",
        "add",
        "--platform",
        "zhihu",
        "--name",
        "挪动测试账号",
      ]);
      expectCliOk(accountCommand);
      const accountId = parseJson<{ account: { id: string } }>(
        accountCommand.stdout,
      ).account.id;
      const create = runCli(environment.home, [
        "work",
        "new",
        "--account",
        accountId,
        "--title",
        "被挪走的作品",
      ]);
      expectCliOk(create);
      const workId = must(
        parseJson<{ works: Work[] }>(create.stdout).works[0]?.id,
        "作品编号",
      );

      const startedCommand = runCli(environment.home, ["work", "next"]);
      expectCliOk(startedCommand);
      const started = parseJson<Started>(startedCommand.stdout);
      const token = must(started.lease?.token, "旧令牌");

      const moved = await apiRequest(environment, `/api/works/${workId}/move`, {
        method: "POST",
        body: { status: "todo", beforeId: null },
      });
      expect(moved.status).toBe(200);

      const staleStep = runCli(environment.home, [
        "work",
        "step",
        workId,
        "--lease",
        token,
      ]);
      expect(staleStep.status).toBe(1);
      const failure = parseJson<{
        ok: false;
        error: { code: string; message: string };
      }>(staleStep.stdout);
      expect(failure.ok).toBe(false);
      expect(failure.error.code).toBe("STATE_CONFLICT");
      expect(failure.error.message).toContain("待实现");
      expect(staleStep.stdout).not.toContain(token);

      const showCommand = runCli(environment.home, ["work", "show", workId]);
      expectCliOk(showCommand);
      expect(
        parseJson<{ detail: WorkDetail }>(showCommand.stdout).detail.work
          .status,
      ).toBe("todo");
    } finally {
      await environment.close();
    }
  }, 60_000);

  it("作品仍在进行中但被 force 接管后，旧令牌提示令牌不匹配", async () => {
    const environment = await createM1Environment(false);
    try {
      const accountCommand = runCli(environment.home, [
        "account",
        "add",
        "--platform",
        "zhihu",
        "--name",
        "force 接管测试账号",
      ]);
      expectCliOk(accountCommand);
      const accountId = parseJson<{ account: { id: string } }>(
        accountCommand.stdout,
      ).account.id;

      const create = runCli(environment.home, [
        "work",
        "new",
        "--account",
        accountId,
        "--title",
        "令牌被接管的作品",
      ]);
      expectCliOk(create);
      const workId = must(
        parseJson<{ works: Work[] }>(create.stdout).works[0]?.id,
        "作品编号",
      );

      const firstStart = runCli(environment.home, ["work", "next"]);
      expectCliOk(firstStart);
      const oldToken = must(
        parseJson<Started>(firstStart.stdout).lease?.token,
        "旧 agent 令牌",
      );

      const takeover = runCli(environment.home, [
        "work",
        "start",
        workId,
        "--force",
      ]);
      expectCliOk(takeover);
      const newToken = must(
        parseJson<Started>(takeover.stdout).lease?.token,
        "接管后的令牌",
      );
      expect(newToken).not.toBe(oldToken);
      expect(parseJson<Started>(takeover.stdout).detail?.work.status).toBe(
        "doing",
      );

      const staleStep = runCli(environment.home, [
        "work",
        "step",
        workId,
        "--lease",
        oldToken,
      ]);
      expect(staleStep.status).toBe(1);
      const failure = parseJson<{
        ok: false;
        error: { code: string; message: string };
      }>(staleStep.stdout);
      expect(failure.ok).toBe(false);
      expect(failure.error.code).toBe("STATE_CONFLICT");
      expect(failure.error.message).toContain("令牌对不上");
      expect(staleStep.stdout).not.toContain(oldToken);
    } finally {
      await environment.close();
    }
  }, 60_000);
});
