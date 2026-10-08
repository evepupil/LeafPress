import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeConfigIfAbsent } from "../../src/config/load.js";
import { createCliContext } from "../../src/cli/context.js";
import { executeDoctor } from "../../src/cli/commands/doctor.js";
import type { DoctorDependencies } from "../../src/cli/commands/doctor.js";
import type { RepoStatus } from "../../src/platforms/blog/repo-status.js";
import { execCommand } from "../../src/shared/exec.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function makeHealthyBlog(repoPath: string): Promise<void> {
  await mkdir(join(repoPath, "content", "posts", "zh"), { recursive: true });
  await writeFile(
    join(repoPath, "content", "posts", "zh", "first.md"),
    "---\ntitle: 第一篇\npublished: 2026-01-01\nlocale: zh-CN\n---\n\n正文。\n",
    "utf8",
  );
  await execCommand("git", ["init", "-b", "main"], { cwd: repoPath });
  await execCommand("git", ["add", "."], { cwd: repoPath });
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
  );
}

async function writeConfig(
  home: string,
  repoPath: string,
  siteUrl?: string,
): Promise<void> {
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
      ...(siteUrl === undefined ? {} : { siteUrl }),
    },
  });
}

const healthyStatus: RepoStatus = {
  isRepo: true,
  branch: "main",
  dirty: false,
  hasUpstream: true,
  ahead: 0,
  behind: 0,
};

const fakeStatus: NonNullable<DoctorDependencies["repoStatus"]> = () =>
  Promise.resolve(healthyStatus);

describe("doctor 命令", () => {
  it("配置缺失时报 error，不打开记录库", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-missing-"));
    const home = join(tempDir, "data");
    const context = createCliContext(
      { home },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    );
    const result = await executeDoctor(context);

    expect(result.ok).toBe(false);
    expect(result.checks.map((item) => item.id)).toEqual([
      "node",
      "config",
      "browser",
    ]);
    expect(result.checks.find((item) => item.id === "config")).toMatchObject({
      level: "error",
      hint: "先运行 leafpress init",
    });
    expect(result.checks.some((item) => item.id === "store")).toBe(false);
    expect(result.checks.some((item) => item.id === "blog-repo")).toBe(false);
  });

  it("Node 版本门槛为 24.2", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-node-"));
    const context = createCliContext(
      { home: join(tempDir, "data") },
      { env: {}, homedir: tempDir },
    );

    for (const [version, level] of [
      ["24.1.9", "error"],
      ["24.2.0", "ok"],
      ["25.0.0", "ok"],
    ] as const) {
      const result = await executeDoctor(context, { nodeVersion: version });
      expect(result.checks.find((item) => item.id === "node")).toMatchObject({
        level,
      });
    }
  });

  it("仅保留配置、博客仓库、博客网址和浏览器检查", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-checks-"));
    const home = join(tempDir, "data");
    const repoPath = join(tempDir, "blog");
    await mkdir(repoPath);
    await makeHealthyBlog(repoPath);
    await writeConfig(home, repoPath, "https://example.test");

    const context = createCliContext(
      { home },
      {
        env: {},
        homedir: tempDir,
        edgeLocator: () => join(tempDir ?? "", "edge.exe"),
      },
    );
    const received: unknown[] = [];
    const repoStatus: NonNullable<DoctorDependencies["repoStatus"]> = (
      exec,
      repoPath,
      remote,
      branch,
    ) => {
      received.push(exec, repoPath, remote, branch);
      return Promise.resolve(healthyStatus);
    };
    const result = await executeDoctor(context, { repoStatus });

    expect(result.checks.map((item) => item.id)).toEqual([
      "node",
      "config",
      "blog-repo",
      "blog-site-url",
      "browser",
    ]);
    expect(result.checks.every((item) => item.level === "ok")).toBe(true);
    expect(received).toEqual([execCommand, repoPath, "origin", "main"]);
  });

  it("配置损坏时跳过博客检查，浏览器仍继续检查", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-config-"));
    const home = join(tempDir, "data");
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "config.json"), "{", "utf8");
    const context = createCliContext(
      { home },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    );
    const result = await executeDoctor(context);

    expect(result.checks.map((item) => item.id)).toEqual([
      "node",
      "config",
      "browser",
    ]);
    expect(result.checks.find((item) => item.id === "config")?.level).toBe(
      "error",
    );
    expect(result.checks.find((item) => item.id === "browser")?.level).toBe(
      "warn",
    );
  });

  it("单项检查异常时只降级该项，并且不再包含旧模型检查", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-fallback-"));
    const home = join(tempDir, "data");
    const repoPath = join(tempDir, "blog");
    await writeConfig(home, repoPath, "https://example.test");
    const context = createCliContext(
      { home },
      {
        env: {},
        homedir: tempDir,
        edgeLocator: () => {
          throw new Error("unexpected edge locator failure");
        },
      },
    );
    const result = await executeDoctor(context, { repoStatus: fakeStatus });

    expect(result.ok).toBe(true);
    expect(result.checks.map((item) => item.id)).toEqual([
      "node",
      "config",
      "blog-repo",
      "blog-site-url",
      "browser",
    ]);
    expect(result.checks.find((item) => item.id === "browser")).toMatchObject({
      level: "warn",
      detail: "检查失败：unexpected edge locator failure",
    });
  });
});
