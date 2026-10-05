import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeConfigIfAbsent } from "../../src/config/load.js";
import { createCliContext } from "../../src/cli/context.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("createCliContext：命令上下文", () => {
  it("惰性创建并缓存配置、记录库、平台登记表和工作流引擎", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-context-"));
    const home = join(tempDir, "data");
    const repoPath = join(tempDir, "blog");
    await writeConfigIfAbsent(home, {
      version: 1,
      materials: { projects: [] },
      zhihu: {},
      browser: {},
      blog: {
        repoPath,
        contentDir: "content/posts",
        remote: "origin",
        branch: "main",
        primaryLocaleDir: "zh",
      },
    });

    const context = createCliContext(
      { home },
      {
        env: {},
        homedir: tempDir,
        edgeLocator: () => undefined,
      },
    );
    try {
      expect(context.home).toBe(home);
      expect(await context.getConfig()).toMatchObject({
        blog: { repoPath, contentDir: "content/posts" },
      });
      expect(await context.getRegistry()).toBe(await context.getRegistry());
      expect(context.getStore()).toBe(context.getStore());
      expect(context.getStore().migration).toEqual({ from: 0, to: 1 });
      expect(context.getEngine()).toBe(context.getEngine());
      context.setExitCode(1);
      expect(context.exitCode).toBe(1);
    } finally {
      context.close();
      context.close();
    }
  });

  it("显式 home 优先于注入环境变量，且环境不会被修改", () => {
    const env = { LEAFPRESS_HOME: join(tmpdir(), "env-home") };
    const context = createCliContext(
      { home: join(tmpdir(), "explicit-home") },
      { env, homedir: join(tmpdir(), "user-home") },
    );
    expect(context.home).toBe(join(tmpdir(), "explicit-home"));
    expect(env.LEAFPRESS_HOME).toBe(join(tmpdir(), "env-home"));
    context.close();
  });
});
