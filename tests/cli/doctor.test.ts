import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { executeDoctor, renderDoctor } from "../../src/cli/commands/doctor.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function context(home: string, userHome: string) {
  return createCliContext({ home }, { env: {}, homedir: userHome });
}

function storeVersion(file: string, version: number): void {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version = ${version}`);
  db.close();
}

describe("doctor", () => {
  it("逐项返回七个检查并覆盖正常状态", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-ok-"));
    const home = join(tempDir, "data");
    const userHome = join(tempDir, "user");
    await mkdir(home, { recursive: true });
    await mkdir(join(tempDir, "repo", "web", "out"), { recursive: true });
    await mkdir(join(userHome, ".claude", "skills", "leafpress"), {
      recursive: true,
    });
    await writeFile(
      join(tempDir, "repo", "web", "out", "index.html"),
      "ok",
      "utf8",
    );
    await writeFile(
      join(userHome, ".claude", "skills", "leafpress", "SKILL.md"),
      "ok",
      "utf8",
    );
    storeVersion(join(home, "leafpress.db"), 2);
    const result = await executeDoctor(context(home, userHome), {
      nodeVersion: "24.2.0",
      repoRoot: join(tempDir, "repo"),
      edgeLocator: () => "C:/Edge/msedge.exe",
    });
    expect(result.checks.map((item) => item.id)).toEqual([
      "node",
      "config",
      "store",
      "home",
      "web",
      "skill",
      "browser",
    ]);
    expect(result.checks.map((item) => item.level)).toEqual([
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
    ]);
    expect(result.ok).toBe(true);
    const renderedLines = renderDoctor(result).split("\n");
    expect(renderedLines[0]).toContain("检查项");
    expect(renderedLines.at(-1)).toBe("全部正常");
  });

  it("数据目录和记录库不存在时只告警且绝不创建", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-missing-"));
    const home = join(tempDir, "missing");
    const userHome = join(tempDir, "user");
    const result = await executeDoctor(context(home, userHome), {
      nodeVersion: "24.2.0",
      repoRoot: tempDir,
      edgeLocator: () => undefined,
    });
    expect(result.checks.find((item) => item.id === "config")).toMatchObject({
      level: "ok",
      detail: "用默认配置。",
    });
    expect(result.checks.find((item) => item.id === "store")).toMatchObject({
      level: "warn",
      hint: "运行 leafpress init 创建记录库。",
    });
    expect(result.checks.find((item) => item.id === "home")?.level).toBe(
      "warn",
    );
    expect(result.checks.find((item) => item.id === "web")?.level).toBe("warn");
    expect(result.checks.find((item) => item.id === "skill")?.level).toBe(
      "warn",
    );
    expect(result.checks.find((item) => item.id === "browser")?.level).toBe(
      "warn",
    );
    expect(result.ok).toBe(true);
    expect(existsSync(home)).toBe(false);
  });

  it("第 1 版配置和落后记录库给出升级告警", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-old-"));
    const home = join(tempDir, "data");
    await mkdir(home);
    await writeFile(join(home, "config.json"), '{"version":1}', "utf8");
    storeVersion(join(home, "leafpress.db"), 1);
    const result = await executeDoctor(context(home, join(tempDir, "user")), {
      nodeVersion: "24.2.0",
      repoRoot: tempDir,
    });
    expect(result.checks.find((item) => item.id === "config")).toMatchObject({
      level: "warn",
      hint: "运行 leafpress init 升级配置。",
    });
    expect(result.checks.find((item) => item.id === "store")).toMatchObject({
      level: "warn",
      hint: "下次运行会自动备份并升级。",
    });
  });

  it("分别报告 Node、损坏配置、未来记录库和非目录 home 错误", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-errors-"));
    const home = join(tempDir, "data");
    await mkdir(home);
    await writeFile(join(home, "config.json"), "{", "utf8");
    storeVersion(join(home, "leafpress.db"), 99);
    const result = await executeDoctor(context(home, join(tempDir, "user")), {
      nodeVersion: "24.1.9",
      repoRoot: tempDir,
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((item) => item.id === "node")?.level).toBe(
      "error",
    );
    expect(result.checks.find((item) => item.id === "config")?.level).toBe(
      "error",
    );
    expect(result.checks.find((item) => item.id === "store")?.level).toBe(
      "error",
    );

    const fileHome = join(tempDir, "home-file");
    await writeFile(fileHome, "x", "utf8");
    const homeResult = await executeDoctor(
      context(fileHome, join(tempDir, "user")),
      { nodeVersion: "24.2.0", repoRoot: tempDir },
    );
    expect(homeResult.checks.find((item) => item.id === "home")).toMatchObject({
      level: "error",
      detail: "数据目录路径不是目录。",
    });
  });

  it("凭证和第 1 版配置里的秘密不会进入 doctor 输出", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-secrets-"));
    const home = join(tempDir, "data");
    await mkdir(home, { recursive: true });
    const credentialSecret = "credential-secret-7f2c1a";
    const configSecret = "config-secret-3b8e91";
    await writeFile(
      join(home, "credentials.json"),
      JSON.stringify({
        version: 1,
        accounts: { "zhihu-1": { token: credentialSecret } },
      }),
      "utf8",
    );
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({ version: 1, browser: { executablePath: configSecret } }),
      "utf8",
    );
    const result = await executeDoctor(context(home, join(tempDir, "user")), {
      nodeVersion: "24.2.0",
      repoRoot: tempDir,
      edgeLocator: () => undefined,
    });
    const output = `${JSON.stringify(result)}\n${renderDoctor(result)}`;
    expect(output).not.toContain(credentialSecret);
    expect(output).not.toContain(configSecret);
    expect(result.checks.find((item) => item.id === "config")?.level).toBe(
      "warn",
    );
  });

  it("第 2 版配置正常且不可写目录报告错误", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-write-"));
    const home = join(tempDir, "data");
    await mkdir(home, { recursive: true });
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({ version: 2, server: { port: 4321 } }),
      "utf8",
    );
    const result = await executeDoctor(context(home, join(tempDir, "user")), {
      nodeVersion: "24.2.0",
      repoRoot: tempDir,
      edgeLocator: () => undefined,
      canWriteDirectory: () => false,
    });
    expect(result.checks.find((item) => item.id === "config")).toMatchObject({
      level: "ok",
      detail: `配置文件：${join(home, "config.json")}`,
    });
    expect(result.checks.find((item) => item.id === "home")).toMatchObject({
      level: "error",
      detail: `数据目录不可写：${home}`,
      hint: "检查这个目录的权限。",
    });
    expect(result.ok).toBe(false);
  });

  it("单项浏览器异常不会阻断其余检查，也不输出凭证值", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-doctor-browser-"));
    const home = join(tempDir, "data");
    await mkdir(home);
    const result = await executeDoctor(context(home, join(tempDir, "user")), {
      nodeVersion: "24.2.0",
      repoRoot: tempDir,
      edgeLocator: () => {
        throw new Error("browser lookup failed");
      },
    });
    expect(result.checks.find((item) => item.id === "browser")).toMatchObject({
      level: "warn",
      detail: "检查失败：browser lookup failed",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
