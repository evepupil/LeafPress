import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { execCommand } from "../../../src/shared/exec.js";
import {
  EN_PATH,
  ZH_PATH,
  publish,
  pushCalls,
  readPublished,
  remoteGit,
  withFixture,
} from "./publish-support.js";
import { NOW_ISO, SLUG } from "./steps-fixtures.js";

describe("博客 publish 步骤：可以安全地重复执行", () => {
  it("线上已经有同内容的文章：当作已推送，不再提交不再推", async () => {
    await withFixture(async (fixture) => {
      expect((await publish(fixture)).kind).toBe("done");
      const first = await readPublished(fixture);
      const head = await fixture.remoteHead();
      await writeFile(join(fixture.folder, ".publish.json"), "{}", "utf8");

      const outcome = await publish(fixture, false);

      expect(outcome).toEqual({
        kind: "done",
        note: "线上已经有这篇了，按已推送处理",
      });
      expect(await readPublished(fixture)).toEqual({
        slug: SLUG,
        commit: first.commit,
        pushedAt: NOW_ISO,
      });
      expect(await fixture.remoteHead()).toBe(head);
      expect(pushCalls(fixture)).toHaveLength(1);
      expect(fixture.pnpm.callsOf("content:check")).toHaveLength(1);
    });
  }, 120_000);

  it("提交号取最近动过这篇文章的那个提交，不是线上最新的提交", async () => {
    await withFixture(async (fixture) => {
      expect((await publish(fixture)).kind).toBe("done");
      const mine = (await readPublished(fixture)).commit;
      await fixture.pushFromElsewhere(
        { "content/posts/zh/later.mdx": "之后别人又发了\n" },
        "之后的提交",
      );

      expect((await publish(fixture, false)).kind).toBe("done");

      expect((await readPublished(fixture)).commit).toBe(mine);
    });
  }, 120_000);

  it("线上有同名文章但内容不同：失败，提示改 slug 重新检查", async () => {
    await withFixture(async (fixture) => {
      await fixture.pushFromElsewhere(
        { [ZH_PATH]: "别人的同名文章\n" },
        "同名",
      );
      const before = await fixture.remoteHead();

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: `slug 撞了已有文章：${ZH_PATH}；改 slug.txt 里的 slug，再运行 leafpress work back b-1 4 重新跑检查`,
      });
      expect(await fixture.remoteHead()).toBe(before);
      expect(pushCalls(fixture)).toEqual([]);
    });
  }, 90_000);

  it("线上只有同名英文版：复制时发现撞车，失败，不覆盖", async () => {
    await withFixture(async (fixture) => {
      await fixture.pushFromElsewhere(
        { [EN_PATH]: "someone's english\n" },
        "同名英文",
      );
      const before = await fixture.remoteHead();

      const outcome = await publish(fixture);

      expect(outcome).toEqual({
        kind: "fail",
        error: `slug 撞了已有文章：${EN_PATH}；改 slug.txt 里的 slug，再运行 leafpress work back b-1 4 重新跑检查`,
      });
      expect(await fixture.remoteHead()).toBe(before);
      expect(await remoteGit(fixture, ["show", `main:${EN_PATH}`])).toBe(
        "someone's english",
      );
    });
  }, 90_000);
});

describe("博客 publish 步骤：提交失败", () => {
  it("钩子拦住提交：失败并带上原因，不推送", async () => {
    await withFixture(async (fixture) => {
      const hook = join(fixture.repo, ".git", "hooks", "pre-commit");
      await mkdir(join(fixture.repo, ".git", "hooks"), { recursive: true });
      await writeFile(hook, "#!/bin/sh\necho '今天不许提交' >&2\nexit 1\n");
      await chmod(hook, 0o755);
      const before = await fixture.remoteHead();

      const outcome = await publish(fixture);

      expect(outcome.kind).toBe("fail");
      if (outcome.kind === "fail") {
        expect(outcome.error).toMatch(/^提交失败：/);
        expect(outcome.error).toContain("今天不许提交");
      }
      expect(pushCalls(fixture)).toEqual([]);
      expect(await fixture.remoteHead()).toBe(before);
    });
  }, 90_000);

  it("作者仓库没配用户名邮箱：失败并写明是提交失败", async () => {
    await withFixture(async (fixture) => {
      await fixture.git(["config", "--unset", "user.name"]);
      await fixture.git(["config", "--unset", "user.email"]);
      await fixture.git(["config", "user.useConfigOnly", "true"]);
      const emptyConfig = join(fixture.base, "empty.gitconfig");
      await writeFile(emptyConfig, "", "utf8");
      // 让这次提交看不到本机全局的 git 身份
      fixture.setInterceptor((call, real) =>
        call.args[0] === "commit"
          ? execCommand("git", [...call.args], {
              ...call.options,
              env: {
                ...call.options?.env,
                GIT_CONFIG_GLOBAL: emptyConfig,
                GIT_CONFIG_NOSYSTEM: "1",
              },
            })
          : real(),
      );
      const before = await fixture.remoteHead();

      const outcome = await publish(fixture);

      expect(outcome.kind).toBe("fail");
      if (outcome.kind === "fail") expect(outcome.error).toMatch(/^提交失败：/);
      expect(pushCalls(fixture)).toEqual([]);
      expect(await fixture.remoteHead()).toBe(before);
    });
  }, 90_000);
});
