import { writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
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
}

interface WorkDetail {
  work: Work;
  context: string;
}

function expectCliOk(result: ReturnType<typeof runCli>): void {
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
  expect(result.timedOut).not.toBe(true);
}

describe("M1 变更序号与账号档案", () => {
  it("CLI 写入后立刻可见新 seq；只读命令不改变 seq", async () => {
    const environment = await createM1Environment(true);
    try {
      let previous = (await getVersion(environment)).seq;
      const expectImmediateIncrease = async (): Promise<void> => {
        const startedAt = performance.now();
        const version = await getVersion(environment);
        expect(performance.now() - startedAt).toBeLessThan(2_000);
        expect(version.seq).toBeGreaterThan(previous);
        previous = version.seq;
      };

      const accountCommand = runCli(environment.home, [
        "account",
        "add",
        "--platform",
        "zhihu",
        "--name",
        "序号测试账号",
      ]);
      expectCliOk(accountCommand);
      await expectImmediateIncrease();
      const accountId = parseJson<{ account: { id: string } }>(
        accountCommand.stdout,
      ).account.id;

      const ideaCommand = runCli(environment.home, [
        "ideas",
        "add",
        "通过 CLI 创建灵感",
      ]);
      expectCliOk(ideaCommand);
      await expectImmediateIncrease();

      const workCommand = runCli(environment.home, [
        "work",
        "new",
        "--account",
        accountId,
        "--title",
        "用于只读检查的作品",
      ]);
      expectCliOk(workCommand);
      await expectImmediateIncrease();
      const workId = parseJson<{ works: Work[] }>(workCommand.stdout).works[0]
        ?.id;
      if (workId === undefined) throw new Error("CLI 没有创建作品");

      const nextCommand = runCli(environment.home, ["work", "next"]);
      expectCliOk(nextCommand);
      await expectImmediateIncrease();

      for (const args of [["works"], ["work", "show", workId], ["accounts"]]) {
        const before = (await getVersion(environment)).seq;
        const result = runCli(environment.home, args);
        expectCliOk(result);
        expect((await getVersion(environment)).seq).toBe(before);
      }
    } finally {
      await environment.close();
    }
  }, 60_000);

  it("网页保存的档案出现在 work show；直接改档案会推进 profilesStamp", async () => {
    const environment = await createM1Environment(true);
    try {
      const accountCommand = runCli(environment.home, [
        "account",
        "add",
        "--platform",
        "zhihu",
        "--name",
        "档案同步账号",
      ]);
      expectCliOk(accountCommand);
      const accountId = parseJson<{ account: { id: string } }>(
        accountCommand.stdout,
      ).account.id;
      const workCommand = runCli(environment.home, [
        "work",
        "new",
        "--account",
        accountId,
        "--title",
        "读取账号档案",
      ]);
      expectCliOk(workCommand);
      const workId = parseJson<{ works: Work[] }>(workCommand.stdout).works[0]
        ?.id;
      if (workId === undefined) throw new Error("CLI 没有创建作品");

      const profileText =
        "面向资深工程师，表达直接，优先给出可复现的技术细节。";
      const save = await apiRequest(
        environment,
        `/api/accounts/${accountId}/profile`,
        {
          method: "PUT",
          body: { profile: profileText },
        },
      );
      expect(save.status).toBe(200);

      const shown = runCli(environment.home, ["work", "show", workId]);
      expectCliOk(shown);
      const context = parseJson<{ detail: WorkDetail }>(shown.stdout).detail
        .context;
      expect(context).toContain("## 账号档案");
      expect(context).toContain(profileText);

      const before = (await getVersion(environment)).profilesStamp;
      const profilePath = join(environment.home, "accounts", `${accountId}.md`);
      const changedText = "直接修改后的账号档案内容。\n";
      await writeFile(profilePath, changedText, "utf8");
      const futureStamp = before + 10_000;
      await utimes(profilePath, new Date(futureStamp), new Date(futureStamp));
      const version = await getVersion(environment);
      expect(version.profilesStamp).toBeGreaterThan(before);
    } finally {
      await environment.close();
    }
  }, 60_000);

  it.skip("账号密钥不外泄：M1 内置平台没有可配置密钥项，按任务书条件跳过", () => {
    // All M1 platform setupItems are empty, so account add has no secret setting to exercise.
  });
});
