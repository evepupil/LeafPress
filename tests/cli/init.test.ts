import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import {
  executeInit,
  renderInit,
  type InitResult,
} from "../../src/cli/commands/init.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("init", () => {
  it("创建目录、默认配置和最新版本记录库", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-"));
    const home = join(tempDir, "data");
    const context = createCliContext({ home }, { env: {}, homedir: tempDir });
    const result = await executeInit(context);
    expect(result).toMatchObject({
      home,
      configFile: join(home, "config.json"),
      dbFile: join(home, "leafpress.db"),
      configUpgraded: false,
      migration: { from: 0, to: 2 },
    });
    for (const directory of ["accounts", "tasks", "backups", "logs"])
      expect(existsSync(join(home, directory))).toBe(true);
    expect(JSON.parse(await readFile(result.configFile, "utf8"))).toMatchObject(
      { version: 2 },
    );
    expect(existsSync(result.dbFile)).toBe(true);
    expect(renderInit(result)).toContain(
      "下一步：运行 leafpress serve 打开工作台",
    );
    expect(await executeInit(context)).toMatchObject({
      migration: { from: 2, to: 2 },
    });
  });

  it("为配置和记录库升级提示备份路径", () => {
    const home = "C:/data/leafpress";
    const result: InitResult = {
      home,
      configFile: join(home, "config.json"),
      dbFile: join(home, "leafpress.db"),
      configUpgraded: true,
      configBackup: join(home, "config.v1.json.bak"),
      migration: {
        from: 1,
        to: 2,
        backupPath: join(home, "leafpress.v1.db.bak"),
      },
    };
    const output = renderInit(result);
    expect(output).toContain(`配置已升级，旧的备份在 ${result.configBackup}`);
    expect(output).toContain(
      "旧配置里的博客仓库路径没有迁移：接博客时在博客账号的「接入」里重新填。",
    );
    expect(output).toContain(
      `记录库已从第 1 版升到第 2 版，备份在 ${result.migration.backupPath}`,
    );
  });

  it("系统拒绝创建目录时报告失败路径和权限提示", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-denied-dir-"));
    const home = join(tempDir, "data");
    const context = createCliContext({ home }, { env: {}, homedir: tempDir });
    const failure = Object.assign(new Error("permission denied"), {
      code: "EACCES",
      path: home,
    });
    await expect(
      executeInit(context, {
        createDirectory: () => {
          throw failure;
        },
      }),
    ).rejects.toMatchObject({
      name: "LeafPressError",
      code: "STORE_FAILED",
      message: `无法写入路径：${home}`,
      hint: "检查这个目录的权限",
    });
  });

  it("系统拒绝写配置文件时报告配置路径和权限提示", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-denied-file-"));
    const home = join(tempDir, "data");
    const context = createCliContext({ home }, { env: {}, homedir: tempDir });
    const configFile = join(home, "config.json");
    const failure = Object.assign(new Error("permission denied"), {
      code: "EACCES",
      path: configFile,
    });
    await expect(
      executeInit(context, {
        writeConfig: () => {
          throw failure;
        },
      }),
    ).rejects.toMatchObject({
      name: "LeafPressError",
      code: "STORE_FAILED",
      message: `无法写入路径：${configFile}`,
      hint: "检查这个目录的权限",
    });
  });

  it("拒绝把文件路径当数据目录", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-init-file-"));
    const file = join(tempDir, "home-file");
    await writeFile(file, "x", "utf8");
    const context = createCliContext(
      { home: file },
      { env: {}, homedir: tempDir },
    );
    await expect(executeInit(context)).rejects.toMatchObject({
      code: "USAGE",
      message: `数据目录路径不是目录：${file}`,
    });
  });
});
