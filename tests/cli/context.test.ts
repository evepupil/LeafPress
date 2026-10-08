import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("CLI 上下文", () => {
  it("解析 home 并在只读命令未初始化时不创建任何文件", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-context-"));
    const home = join(tempDir, "data");
    const context = createCliContext({ home }, { env: {}, homedir: tempDir });
    expect(context.home).toBe(home);
    await expect(context.getUseCases()).rejects.toMatchObject({
      code: "USAGE",
      message: "还没初始化",
    });
    expect(existsSync(home)).toBe(false);
    context.setExitCode(1);
    expect(context.exitCode).toBe(1);
  });

  it("显式 home 优先于 LEAFPRESS_HOME，且不修改注入的环境", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-home-"));
    const envHome = join(tempDir, "env-home");
    const selected = join(tempDir, "selected");
    const env = { LEAFPRESS_HOME: envHome };
    const context = createCliContext(
      { home: selected },
      { env, homedir: tempDir },
    );
    expect(context.home).toBe(selected);
    expect(env.LEAFPRESS_HOME).toBe(envHome);
    expect(context.paths.dbFile).toBe(join(selected, "leafpress.db"));
  });
});
