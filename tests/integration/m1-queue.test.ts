import { describe, expect, it } from "vitest";

import {
  createM1Environment,
  parseJson,
  runCli,
  runCliChild,
} from "./fixtures/m1-process.js";

interface Work {
  id: string;
}

interface Started {
  detail: { work: Work } | null;
  lease?: { token: string };
}

function expectCliOk(result: {
  status: number | null;
  stderr: string;
  stdout: string;
}): void {
  expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
}

describe("M1 多进程队列竞争", () => {
  it("五个并发 work next 各取不同作品，队列耗尽后返回空", async () => {
    const environment = await createM1Environment(false);
    try {
      const accountCommand = runCli(environment.home, [
        "account",
        "add",
        "--platform",
        "zhihu",
        "--name",
        "并发账号",
      ]);
      expectCliOk(accountCommand);
      const accountId = parseJson<{ account: { id: string } }>(
        accountCommand.stdout,
      ).account.id;

      for (let index = 1; index <= 5; index += 1) {
        const created = runCli(environment.home, [
          "work",
          "new",
          "--account",
          accountId,
          "--title",
          `并发作品 ${index}`,
        ]);
        expectCliOk(created);
      }

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          runCliChild(environment.home, ["work", "next"]),
        ),
      );
      const started = results.map((result) => {
        expectCliOk(result);
        expect(result.timedOut).not.toBe(true);
        return parseJson<Started>(result.stdout);
      });
      const ids = started.map((result) => result.detail?.work.id);
      expect(ids.every((id) => id !== undefined)).toBe(true);
      expect(new Set(ids).size).toBe(5);
      expect(started.every((result) => result.lease?.token.length === 8)).toBe(
        true,
      );

      const exhausted = runCli(environment.home, ["work", "next"]);
      expectCliOk(exhausted);
      expect(parseJson<Started>(exhausted.stdout).detail).toBeNull();
    } finally {
      await environment.close();
    }
  }, 90_000);
});
