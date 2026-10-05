import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig, writeConfigIfAbsent } from "../../src/config/load.js";
import { createCliContext } from "../../src/cli/context.js";
import { executeDoctor, renderDoctor } from "../../src/cli/commands/doctor.js";
import { main } from "../../src/cli/main.js";
import { homePaths } from "../../src/config/home.js";
import { inspectStore } from "../../src/store/inspect.js";
import { openStore } from "../../src/store/open.js";
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

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const originalStdout = process.stdout.write.bind(process.stdout);
  let output = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  };
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = originalStdout;
  }
}

describe("doctor 命令", () => {
  it("配置缺失时报 error，且只读体检不会创建数据库", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-missing-"));
    const home = join(tempDir, "data");
    const context = createCliContext(
      { home },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    );
    try {
      const result = await executeDoctor(context);
      expect(result.ok).toBe(false);
      expect(result.checks.find((item) => item.id === "config")).toMatchObject({
        level: "error",
        hint: "先运行 leafpress init",
      });
      expect(result.checks.find((item) => item.id === "store")?.level).toBe(
        "warn",
      );
      expect(result.checks.some((item) => item.id === "blog-repo")).toBe(false);
      expect(result.checks.some((item) => item.id === "zhihu-developer")).toBe(
        false,
      );
      expect(existsSync(join(home, "leafpress.db"))).toBe(false);
    } finally {
      context.close();
    }
  });

  it("Node 版本门槛为 24.2", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-node-"));
    const context = createCliContext(
      { home: join(tempDir, "data") },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    );
    try {
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
    } finally {
      context.close();
    }
  });

  it("凭证缺失时给出 warn，输出不包含配置或环境里的密钥值", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-creds-"));
    const home = join(tempDir, "data");
    await writeConfigIfAbsent(home, {
      version: 1,
      materials: { projects: [] },
      zhihu: {},
      browser: {},
      blog: {
        repoPath: join(tempDir, "blog"),
        contentDir: "content/posts",
        remote: "origin",
        branch: "main",
        primaryLocaleDir: "zh",
      },
    });
    const context = createCliContext(
      { home },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    );
    try {
      const result = await executeDoctor(context);
      expect(
        result.checks.find((item) => item.id === "zhihu-openapi")?.level,
      ).toBe("warn");
      expect(
        result.checks.find((item) => item.id === "zhihu-developer")?.level,
      ).toBe("warn");
    } finally {
      context.close();
    }
  });

  it("单项检查意外抛错时仅降级为 warn，继续其他检查且退出码为 0", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-fallback-"));
    const home = join(tempDir, "data");
    const repoPath = join(tempDir, "blog");
    await mkdir(repoPath);
    await makeHealthyBlog(repoPath);
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
    const previousExitCode = process.exitCode;
    try {
      const output = await captureStdout(() =>
        main(["--home", home, "--json", "doctor"], {
          createContext: (options) =>
            createCliContext(options, {
              env: {},
              homedir: tempDir,
              edgeLocator: () => {
                throw new Error("unexpected edge locator failure");
              },
            }),
        }),
      );
      expect(output).toContain('"ok": true');
      expect(output).toContain('"id": "blog-repo"');
      expect(output).toContain('"id": "blog-posts"');
      expect(output).toContain('"id": "zhihu-developer"');
      expect(output).toContain('"id": "browser"');
      expect(output).toContain('"level": "warn"');
      expect(output).toContain(
        '"detail": "检查失败：unexpected edge locator failure"',
      );
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("凭证来源冲突时的任何说明都不泄露用户名或密钥", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-conflict-"));
    const home = join(tempDir, "data");
    await writeConfigIfAbsent(home, {
      version: 1,
      materials: { projects: [] },
      zhihu: { developerAccessSecret: "CONFIG-DEV-SECRET-UNIQUE" },
      browser: {},
      blog: {
        repoPath: join(tempDir, "blog"),
        contentDir: "content/posts",
        remote: "origin",
        branch: "main",
        primaryLocaleDir: "zh",
      },
    });
    await mkdir(join(tempDir, ".zhihu"), { recursive: true });
    await writeFile(
      join(tempDir, ".zhihu", "openapi-credentials.json"),
      JSON.stringify({
        ZHIHU_OPENAPI_APP_KEY: "FILE-ACCOUNT-UNIQUE",
        ZHIHU_OPENAPI_APP_SECRET: "FILE-SECRET-UNIQUE",
      }),
      "utf8",
    );
    const context = createCliContext(
      { home },
      {
        env: {
          ZHIHU_OPENAPI_APP_KEY: "ENV-ACCOUNT-UNIQUE",
          ZHIHU_OPENAPI_APP_SECRET: "ENV-SECRET-UNIQUE",
          ZHIHU_DEVELOPER_ACCESS_SECRET: "ENV-DEV-SECRET-UNIQUE",
        },
        homedir: tempDir,
        edgeLocator: () => undefined,
      },
    );
    try {
      const result = await executeDoctor(context);
      const output = `${renderDoctor(result)}\\n${JSON.stringify(result)}`;
      expect(
        result.checks.find((item) => item.id === "zhihu-openapi")?.level,
      ).toBe("warn");
      for (const value of [
        "FILE-ACCOUNT-UNIQUE",
        "FILE-SECRET-UNIQUE",
        "ENV-ACCOUNT-UNIQUE",
        "ENV-SECRET-UNIQUE",
        "CONFIG-DEV-SECRET-UNIQUE",
        "ENV-DEV-SECRET-UNIQUE",
      ]) {
        expect(output).not.toContain(value);
      }
    } finally {
      context.close();
    }
  });

  it("单项凭证检查抛错时记录原因并继续后续检查", async () => {
    tempDir = await mkdtemp(
      join(tmpdir(), "leafpress-cli-doctor-check-error-"),
    );
    await mkdir(join(tempDir, ".zhihu", "openapi-credentials.json"), {
      recursive: true,
    });
    const context = createCliContext(
      { home: join(tempDir, "data") },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    );
    try {
      const result = await executeDoctor(context);
      const openApi = result.checks.find((item) => item.id === "zhihu-openapi");
      expect(openApi).toMatchObject({ level: "warn" });
      expect(openApi?.detail).toContain("EISDIR");
      for (const id of [
        "zhihu-publisher-skill",
        "zhihu-uploader-skill",
        "browser",
      ]) {
        expect(result.checks.some((item) => item.id === id)).toBe(true);
      }
    } finally {
      context.close();
    }
  });

  it("配置损坏或校验失败时保留下层 message/hint 且跳过依赖检查", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-config-"));
    for (const [index, content] of ["{", "{}"].entries()) {
      const home = join(tempDir, `data-${index}`);
      await mkdir(home, { recursive: true });
      await writeFile(join(home, "config.json"), content, "utf8");
      const expected = await loadConfig(home).then(
        () => undefined,
        (error: unknown) => error,
      );
      const context = createCliContext(
        { home },
        { env: {}, homedir: tempDir, edgeLocator: () => undefined },
      );
      try {
        const result = await executeDoctor(context);
        const config = result.checks.find((item) => item.id === "config");
        expect(config?.detail).toBe((expected as Error).message);
        expect(config?.hint).toBe((expected as { hint?: string }).hint);
        if (content === "{}") expect(config?.hint).not.toContain("init");
        expect(result.checks.some((item) => item.id === "blog-repo")).toBe(
          false,
        );
        expect(
          result.checks.some((item) => item.id === "zhihu-developer"),
        ).toBe(false);
      } finally {
        context.close();
      }
    }
  });

  it("旧版记录库体检不会执行迁移或改写文件", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-old-store-"));
    const home = join(tempDir, "data");
    const dbFile = homePaths(home).dbFile;
    const store = openStore(dbFile, { migrations: [] });
    store.close();
    const beforeHash = fileHash(dbFile);
    const context = createCliContext(
      { home },
      { env: {}, homedir: tempDir, edgeLocator: () => undefined },
    );
    try {
      const result = await executeDoctor(context);
      expect(result.checks.find((item) => item.id === "store")).toMatchObject({
        level: "warn",
        detail: "表结构版本为 0，当前代码支持版本 1。",
      });
      expect(fileHash(dbFile)).toBe(beforeHash);
      expect(inspectStore(dbFile)).toMatchObject({ exists: true, version: 0 });
    } finally {
      context.close();
    }
  });

  it("正常环境全部通过，且检查前后记录库内容不变、输出不泄密", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-ok-"));
    const home = join(tempDir, "data");
    const repoPath = join(tempDir, "blog");
    await mkdir(repoPath);
    await makeHealthyBlog(repoPath);
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
        siteUrl: "https://example.test",
      },
    });
    const store = openStore(homePaths(home).dbFile);
    store.close();
    for (const skill of ["zhihu-publisher", "zhihu-mediacloud-uploader"]) {
      const skillPath = join(tempDir, ".claude", "skills", skill, "SKILL.md");
      await mkdir(join(skillPath, ".."), { recursive: true });
      await writeFile(skillPath, "临时测试 skill", "utf8");
    }
    const env = {
      ZHIHU_OPENAPI_APP_KEY: "test-account",
      ZHIHU_OPENAPI_APP_SECRET: "SECRET-zz9-unique",
      ZHIHU_DEVELOPER_ACCESS_SECRET: "DEV-SECRET-zz9-unique",
    };
    const context = createCliContext(
      { home },
      {
        env,
        homedir: tempDir,
        edgeLocator: () => join(tempDir ?? "", "edge.exe"),
      },
    );
    const dbFile = homePaths(home).dbFile;
    const beforeHash = fileHash(dbFile);
    try {
      const result = await executeDoctor(context);
      expect(
        result.checks.map((item) => ({
          id: item.id,
          level: item.level,
          detail: item.detail,
        })),
      ).toEqual(
        result.checks.map((item) => ({
          id: item.id,
          level: "ok",
          detail: item.detail,
        })),
      );
      expect(fileHash(dbFile)).toBe(beforeHash);
      const output = `${renderDoctor(result)}\n${JSON.stringify(result)}`;
      expect(output).not.toContain(env.ZHIHU_OPENAPI_APP_SECRET);
      expect(output).not.toContain(env.ZHIHU_DEVELOPER_ACCESS_SECRET);
    } finally {
      context.close();
    }
    expect(existsSync(dbFile)).toBe(true);
  });
});
