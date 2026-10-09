import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EN_PATH,
  ZH_PATH,
  callsAfterFirstPush,
  commitInfo,
  gitSubcommands,
  publish,
  pushCalls,
  readPublished,
  rebaseOntoOnline,
  withFixture,
} from "./publish-support.js";
import { exists, failure, ok } from "./steps-fixtures.js";

describe("博客 publish 步骤：推送被拒、超时和结果不明", () => {
  it("线上前进了（推送被拒）：fetch、变基、再跑一次 content:check、再推一次，最后成功", async () => {
    await withFixture(async (fixture) => {
      const before = await fixture.remoteHead();
      let advanced = "";
      fixture.setInterceptor(async (call, real) => {
        if (call.args[0] === "push" && advanced === "") {
          advanced = await fixture.pushFromElsewhere(
            { "content/posts/zh/someone-else.mdx": "别人先发了\n" },
            "别人先发了一篇",
          );
        }
        return real();
      });

      const outcome = await publish(fixture);

      const head = await fixture.remoteHead();
      expect(outcome).toEqual({
        kind: "done",
        note: `已推送（提交 ${head.slice(0, 7)}）`,
      });
      expect(pushCalls(fixture)).toHaveLength(2);
      expect(rebaseOntoOnline(fixture)).toHaveLength(1);
      expect(fixture.pnpm.callsOf("content:check")).toHaveLength(2);
      // 线上历史是直线：初始 → 别人的 → 我们的
      const info = await commitInfo(fixture, head);
      expect(info.parents).toEqual([advanced]);
      expect(info.files).toEqual([EN_PATH, ZH_PATH].sort());
      expect((await commitInfo(fixture, advanced)).parents).toEqual([before]);
      // 推送凭据记的是变基之后线上真有的那个提交
      expect((await readPublished(fixture)).commit).toBe(head);
    });
  }, 120_000);

  it("变基后的 content:check 没过：失败，不再推", async () => {
    await withFixture(async (fixture) => {
      let advanced = false;
      fixture.setInterceptor(async (call, real) => {
        if (call.args[0] === "push" && !advanced) {
          advanced = true;
          await fixture.pushFromElsewhere(
            { "content/posts/zh/someone-else.mdx": "别人先发了\n" },
            "别人先发了一篇",
          );
        }
        return real();
      });
      let checks = 0;
      fixture.pnpm.on("content:check", () => {
        checks += 1;
        return checks === 1 ? ok() : failure("撞了 translationKey");
      });

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "博客 content:check 没过：撞了 translationKey",
      });
      expect(pushCalls(fixture)).toHaveLength(1);
      expect(await exists(join(fixture.folder, ".publish.json"))).toBe(false);
    });
  }, 120_000);

  it("一直被拒：最多变基重推 2 次（共推 3 次），然后失败", async () => {
    await withFixture(async (fixture) => {
      let round = 0;
      fixture.setInterceptor(async (call, real) => {
        if (call.args[0] === "push") {
          round += 1;
          await fixture.pushFromElsewhere(
            { [`content/posts/zh/race-${round}.mdx`]: `第 ${round} 个\n` },
            `抢先 ${round}`,
          );
        }
        return real();
      });

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "推送被拒了 3 次（线上一直有新提交），可以重新运行 work run",
      });
      expect(pushCalls(fixture)).toHaveLength(3);
      expect(rebaseOntoOnline(fixture)).toHaveLength(2);
      expect(await exists(join(fixture.folder, ".publish.json"))).toBe(false);
    });
  }, 180_000);

  it("变基时和线上同名文章冲突：撤回变基并报错", async () => {
    await withFixture(async (fixture) => {
      let advanced = false;
      fixture.setInterceptor(async (call, real) => {
        if (call.args[0] === "push" && !advanced) {
          advanced = true;
          await fixture.pushFromElsewhere(
            { [ZH_PATH]: "别人抢先发了同名文章\n" },
            "别人发了同名文章",
          );
        }
        return real();
      });
      const other = await fixture.remoteHead();

      const outcome = await publish(fixture);

      expect(outcome.kind).toBe("fail");
      if (outcome.kind === "fail") {
        expect(outcome.error).toMatch(
          /^线上有新提交，把这篇文章接到最新的 main 上失败（可能线上同时出现了同名文章）/,
        );
        expect(outcome.error).toMatch(/可以重新运行 work run$/);
      }
      expect(
        callsAfterFirstPush(fixture).some(
          (call) => call.args[0] === "rebase" && call.args[1] === "--abort",
        ),
      ).toBe(true);
      // 撤回后检出目录里没有进行到一半的变基
      const rebaseDir = await fixture.git(
        ["rev-parse", "--git-path", "rebase-merge"],
        fixture.checkoutDir,
      );
      expect(await exists(resolve(fixture.checkoutDir, rebaseDir))).toBe(false);
      expect(await fixture.remoteHead()).not.toBe(other);
      expect(await exists(join(fixture.folder, ".publish.json"))).toBe(false);
    });
  }, 120_000);

  it("推送超时但其实已经到了线上：到线上核对后当作成功，不推第二次", async () => {
    await withFixture(async (fixture) => {
      fixture.setInterceptor(async (call, real) => {
        if (call.args[0] === "push") {
          await real();
          return { stdout: "", stderr: "", exitCode: -1, timedOut: true };
        }
        return real();
      });

      const outcome = await publish(fixture);

      const head = await fixture.remoteHead();
      expect(outcome).toEqual({
        kind: "done",
        note: `已推送（提交 ${head.slice(0, 7)}）`,
      });
      expect(pushCalls(fixture)).toHaveLength(1);
      expect(
        gitSubcommands(fixture, "merge-base").map((call) => call.args),
      ).toContainEqual(["merge-base", "--is-ancestor", head, "origin/main"]);
      expect((await readPublished(fixture)).commit).toBe(head);
    });
  }, 90_000);

  it("推送报错但其实已经到了线上（连接中途断了）：同样当作成功", async () => {
    await withFixture(async (fixture) => {
      fixture.setInterceptor(async (call, real) => {
        if (call.args[0] === "push") {
          await real();
          return {
            stdout: "",
            stderr: "fatal: the remote end hung up unexpectedly",
            exitCode: 128,
            timedOut: false,
          };
        }
        return real();
      });

      const outcome = await publish(fixture);

      expect(outcome.kind).toBe("done");
      expect((await readPublished(fixture)).commit).toBe(
        await fixture.remoteHead(),
      );
    });
  }, 90_000);

  it("推送超时而且线上没有这次提交：失败，可以重新运行", async () => {
    await withFixture(async (fixture) => {
      const before = await fixture.remoteHead();
      fixture.setInterceptor((call, real) =>
        call.args[0] === "push"
          ? Promise.resolve({
              stdout: "",
              stderr: "",
              exitCode: -1,
              timedOut: true,
            })
          : real(),
      );

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: "推送没成功，线上没有这次提交，可以重新运行 work run：推送超时",
      });
      expect(await fixture.remoteHead()).toBe(before);
      expect(await exists(join(fixture.folder, ".publish.json"))).toBe(false);
      expect(pushCalls(fixture)).toHaveLength(1);
    });
  }, 90_000);

  it("推送被拒绝（没权限之类）且线上没有：失败并带上原因，网址里的口令抹掉", async () => {
    await withFixture(async (fixture) => {
      fixture.setInterceptor((call, real) =>
        call.args[0] === "push"
          ? Promise.resolve({
              stdout: "",
              stderr:
                "fatal: Authentication failed for 'https://user:topsecret@github.test/x.git'",
              exitCode: 128,
              timedOut: false,
            })
          : real(),
      );

      const outcome = await publish(fixture);

      expect(outcome.kind).toBe("fail");
      if (outcome.kind === "fail") {
        expect(outcome.error).toContain(
          "推送没成功，线上没有这次提交，可以重新运行 work run：",
        );
        expect(outcome.error).toContain("Authentication failed");
        expect(outcome.error).not.toContain("topsecret");
      }
      expect(pushCalls(fixture)).toHaveLength(1);
    });
  }, 90_000);

  it("推送超时、线上也连得上，但核对命令自己出错：说明结果不明，不说「线上没有」", async () => {
    await withFixture(async (fixture) => {
      fixture.setInterceptor((call, real) => {
        if (call.args[0] === "push") {
          return Promise.resolve({
            stdout: "",
            stderr: "",
            exitCode: -1,
            timedOut: true,
          });
        }
        if (call.args[0] === "merge-base") {
          return Promise.resolve({
            stdout: "",
            stderr: "fatal: Not a valid commit name",
            exitCode: 128,
            timedOut: false,
          });
        }
        return real();
      });

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error:
          "推送结果不明，也没能核对线上有没有这次提交（推送超时）；可以重新运行 work run，重跑时会先看线上有没有这篇",
      });
    });
  }, 90_000);

  it("推送失败又连不上线上核对：说明结果不明", async () => {
    await withFixture(async (fixture) => {
      let pushed = false;
      fixture.setInterceptor((call, real) => {
        if (call.args[0] === "push") {
          pushed = true;
          return Promise.resolve({
            stdout: "",
            stderr: "",
            exitCode: -1,
            timedOut: true,
          });
        }
        if (pushed && call.args[0] === "fetch") {
          return Promise.resolve({
            stdout: "",
            stderr: "fatal: unable to access",
            exitCode: 128,
            timedOut: false,
          });
        }
        return real();
      });

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error:
          "推送结果不明，也没能连上线上核对（推送超时）；可以重新运行 work run，重跑时会先看线上有没有这篇",
      });
    });
  }, 90_000);
});
