import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCliContext } from "../../src/cli/context.js";
import { executeInit } from "../../src/cli/commands/init.js";
import { execCommand } from "../../src/shared/exec.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function makeBlogRepo(repoPath: string): Promise<void> {
  await mkdir(join(repoPath, "content", "posts", "zh"), { recursive: true });
  await writeFile(
    join(repoPath, "content", "posts", "zh", "first.md"),
    "---\ntitle: 第一篇\npublished: 2026-01-01\nlocale: zh-CN\n---\n\n正文。\n",
    "utf8",
  );
  expect(
    (await execCommand("git", ["init", "-b", "main"], { cwd: repoPath }))
      .exitCode,
  ).toBe(0);
  expect(
    (await execCommand("git", ["add", "."], { cwd: repoPath })).exitCode,
  ).toBe(0);
  expect(
    (
      await execCommand(
        "git",
        [
          "-c",
          "user.name=test",
          "-c",
          "user.email=test@example.com",
          "commit",
          "-m",
          "initial",
        ],
        { cwd: repoPath },
      )
    ).exitCode,
  ).toBe(0);
}

describe("init 命令", () => {
  it("首次写入默认配置但不创建记录库", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-"));
    const repoPath = join(tempDir, "blog");
    await mkdir(repoPath);
    await makeBlogRepo(repoPath);
    const home = join(tempDir, "data");
    const context = createCliContext({ home }, { env: {}, homedir: tempDir });

    const result = await executeInit(context, {
      blog: repoPath,
      siteUrl: "https://example.test",
    });
    expect(result.created).toBe(true);
    expect(result.home).toBe(resolve(home));
    expect(JSON.parse(await readFile(result.configFile, "utf8"))).toMatchObject(
      {
        version: 1,
        blog: { repoPath: resolve(repoPath), siteUrl: "https://example.test" },
      },
    );
    expect(existsSync(join(home, "leafpress.db"))).toBe(false);
    expect(result.nextStep).toContain("leafpress doctor");
  });

  it("配置已存在时不覆盖，也不要求新的博客路径", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-existing-"));
    const repoPath = join(tempDir, "blog");
    await mkdir(repoPath);
    await makeBlogRepo(repoPath);
    const context = createCliContext(
      { home: join(tempDir, "data") },
      { env: {}, homedir: tempDir },
    );

    const first = await executeInit(context, { blog: repoPath });
    const before = await readFile(first.configFile, "utf8");
    const second = await executeInit(context, {});
    expect(second.created).toBe(false);
    expect(await readFile(first.configFile, "utf8")).toBe(before);
    expect(second.configFile).toBe(first.configFile);
  });

  it("缺少博客参数或仓库结构不合法时抛 USAGE", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-invalid-"));
    const context = createCliContext(
      { home: join(tempDir, "data") },
      { env: {}, homedir: tempDir },
    );
    const noGitRepo = join(tempDir, "no-git");
    await mkdir(join(noGitRepo, "content", "posts"), { recursive: true });
    const noPostsRepo = join(tempDir, "no-posts");
    await mkdir(join(noPostsRepo, ".git"), { recursive: true });

    await expect(executeInit(context, {})).rejects.toMatchObject({
      code: "USAGE",
    });
    await expect(
      executeInit(context, { blog: join(tempDir, "missing") }),
    ).rejects.toMatchObject({ code: "USAGE" });
    await expect(
      executeInit(context, { blog: noGitRepo }),
    ).rejects.toMatchObject({ code: "USAGE" });
    await expect(
      executeInit(context, { blog: noPostsRepo }),
    ).rejects.toMatchObject({ code: "USAGE" });

    const homeFile = join(tempDir, "home-file");
    await writeFile(homeFile, "not a directory", "utf8");
    const fileHomeContext = createCliContext(
      { home: homeFile },
      { env: {}, homedir: tempDir },
    );
    const failedInit = executeInit(fileHomeContext, { blog: noGitRepo });
    await expect(failedInit).rejects.toMatchObject({ code: "USAGE" });
    await expect(failedInit).rejects.toThrow("数据目录路径不是目录");
    expect(existsSync(join(homeFile, "config.json"))).toBe(false);

    const parentFile = join(tempDir, "home-parent-file");
    await writeFile(parentFile, "not a directory", "utf8");
    const nestedHome = join(parentFile, "nested", "leafpress");
    const nestedHomeContext = createCliContext(
      { home: nestedHome },
      { env: {}, homedir: tempDir },
    );
    await expect(executeInit(nestedHomeContext, {})).rejects.toMatchObject({
      code: "USAGE",
      message: `数据目录路径中的中间部分不是目录：${nestedHome}`,
    });
    expect(existsSync(nestedHome)).toBe(false);
  });

  it("只接受带主机名的 HTTP(S) 博客网址", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-url-"));
    const repoPath = join(tempDir, "blog");
    await mkdir(repoPath);
    await makeBlogRepo(repoPath);
    const home = join(tempDir, "data");
    const context = createCliContext({ home }, { env: {}, homedir: tempDir });

    for (const siteUrl of ["ftp://example.test", "not a url", "https://"]) {
      await expect(
        executeInit(context, { blog: repoPath, siteUrl }),
      ).rejects.toMatchObject({
        code: "USAGE",
        message: "博客网址不是合法的 HTTP(S) 网址。",
      });
    }
    expect(existsSync(join(home, "config.json"))).toBe(false);
    expect(existsSync(join(home, "leafpress.db"))).toBe(false);
  });
});
