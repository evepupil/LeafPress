import { statSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  inspectConfig,
  loadConfig,
  upgradeLegacyConfig,
  writeConfig,
  writeConfigIfAbsent,
} from "../../src/config/load.js";
import {
  DEFAULT_CONFIG,
  type LeafPressConfig,
} from "../../src/config/schema.js";
import { LeafPressError } from "../../src/shared/errors.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "leafpress-config-v2-"));
  dirs.push(dir);
  return dir;
}

function validConfig(): LeafPressConfig {
  return {
    version: 2,
    server: { port: 4321 },
    browser: { executablePath: "C:/tools/browser.exe" },
    schedule: { dataPullAt: "23:59" },
    lease: { minutes: 45 },
    ideas: { devRoots: ["C:/code"] },
  };
}

async function expectInvalid(
  home: string,
  raw: string,
  secret?: string,
): Promise<void> {
  await writeFile(join(home, "config.json"), raw, "utf8");
  try {
    loadConfig(home);
    expect.unreachable("应抛 CONFIG_INVALID");
  } catch (error) {
    expect(error).toBeInstanceOf(LeafPressError);
    const failure = error as LeafPressError;
    expect(failure.code).toBe("CONFIG_INVALID");
    expect(failure.cause).toBeUndefined();
    if (secret !== undefined) {
      expect(failure.message).not.toContain(secret);
      expect(failure.hint ?? "").not.toContain(secret);
    }
  }
}

describe("配置 v2", () => {
  it("文件不存在时给出默认配置，且 inspect 只报告不存在", async () => {
    const home = await makeHome();
    expect(loadConfig(home)).toEqual({
      version: 2,
      server: { port: 3210 },
      browser: {},
      schedule: { dataPullAt: "06:00" },
      lease: { minutes: 120 },
      ideas: {},
    });
    expect(inspectConfig(home)).toEqual({ exists: false });
    expect(DEFAULT_CONFIG).toEqual(loadConfig(home));
  });

  it("读取完整 v2 配置并识别版本", async () => {
    const home = await makeHome();
    await writeFile(
      join(home, "config.json"),
      JSON.stringify(validConfig()),
      "utf8",
    );
    expect(loadConfig(home)).toEqual(validConfig());
    expect(inspectConfig(home)).toEqual({ exists: true, version: 2 });
  });

  it("整段缺省时分别补齐所有内部默认值", async () => {
    const home = await makeHome();
    await writeFile(join(home, "config.json"), '{"version":2}', "utf8");
    expect(loadConfig(home)).toEqual(DEFAULT_CONFIG);
  });

  it("接受所有数值和时间边界，保留非空浏览器路径原值", async () => {
    const home = await makeHome();
    const minimums: LeafPressConfig = {
      version: 2,
      server: { port: 1024 },
      browser: { executablePath: " edge.exe " },
      schedule: { dataPullAt: "00:00" },
      lease: { minutes: 5 },
      ideas: {},
    };
    await writeFile(
      join(home, "config.json"),
      JSON.stringify(minimums),
      "utf8",
    );
    expect(loadConfig(home)).toEqual(minimums);

    const maximums: LeafPressConfig = {
      version: 2,
      server: { port: 65535 },
      browser: {},
      schedule: { dataPullAt: "23:59" },
      lease: { minutes: 1440 },
      ideas: { devRoots: ["C:/code", "D:\\proj"] },
    };
    await writeFile(
      join(home, "config.json"),
      JSON.stringify(maximums),
      "utf8",
    );
    expect(loadConfig(home)).toEqual(maximums);
  });

  it("未知字段、端口越界和错误时间格式均报告路径且不回显字段值", async () => {
    const home = await makeHome();
    const special = "LEAK-value-9a83";
    await expectInvalid(
      home,
      JSON.stringify({ version: 2, unexpected: special }),
      special,
    );
    try {
      loadConfig(home);
    } catch (error) {
      expect((error as Error).message).toContain("unexpected");
    }

    await expectInvalid(
      home,
      JSON.stringify({ version: 2, server: { port: 99999 } }),
      "99999",
    );
    try {
      loadConfig(home);
    } catch (error) {
      expect((error as Error).message).toContain("server.port");
    }

    await expectInvalid(
      home,
      JSON.stringify({ version: 2, server: { port: 1023 } }),
      "1023",
    );
    await expectInvalid(
      home,
      JSON.stringify({ version: 2, lease: { minutes: 1441 } }),
      "1441",
    );
    await expectInvalid(
      home,
      JSON.stringify({ version: 2, browser: { executablePath: "   " } }),
      "   ",
    );
    await expectInvalid(
      home,
      JSON.stringify({ version: 2, schedule: { dataPullAt: "24:00" } }),
      "24:00",
    );
    try {
      loadConfig(home);
    } catch (error) {
      expect((error as Error).message).toContain("schedule.dataPullAt");
    }
  });

  it("ideas.devRoots：可配、旧配置缺省 {}、非法值报错", async () => {
    const home = await makeHome();

    // 旧配置文件（加 ideas 之前写的）没有这一项，照样能读，补上缺省 {}
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({
        version: 2,
        server: { port: 4321 },
        browser: {},
        schedule: { dataPullAt: "23:59" },
        lease: { minutes: 45 },
      }),
      "utf8",
    );
    expect(loadConfig(home).ideas).toEqual({});

    // 显式配了字符串数组时原样读回
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({
        version: 2,
        ideas: { devRoots: ["C:/code", "D:/proj"] },
      }),
      "utf8",
    );
    expect(loadConfig(home).ideas).toEqual({
      devRoots: ["C:/code", "D:/proj"],
    });

    // 非法值：元素不是字符串、空字符串、多余字段，都按现有规矩报配置错误且报出路径
    await expectInvalid(
      home,
      JSON.stringify({ version: 2, ideas: { devRoots: ["C:/code", 3] } }),
    );
    try {
      loadConfig(home);
    } catch (error) {
      expect((error as Error).message).toContain("ideas.devRoots");
    }

    await expectInvalid(
      home,
      JSON.stringify({ version: 2, ideas: { devRoots: ["   "] } }),
    );

    await expectInvalid(
      home,
      JSON.stringify({ version: 2, ideas: { devRoots: [], extra: 1 } }),
    );
    try {
      loadConfig(home);
    } catch (error) {
      expect((error as Error).message).toContain("ideas");
    }
  });

  it("损坏 JSON 的错误不含原始内容", async () => {
    const home = await makeHome();
    await expectInvalid(
      home,
      '"SECRET-json-fragment-31" { bad',
      "SECRET-json-fragment-31",
    );
  });

  it("合法 v1 只迁移 browser.executablePath，不读取、写出或报出密钥", async () => {
    const home = await makeHome();
    const secret = "SECRET-legacy-zhihu-77a";
    const legacy = {
      version: 1,
      blog: { repoPath: "DO-NOT-MIGRATE" },
      materials: { projects: ["DO-NOT-MIGRATE"] },
      zhihu: { developerAccessSecret: secret },
      browser: { executablePath: "C:/browser.exe", ignored: "hidden" },
    };
    await writeFile(join(home, "config.json"), JSON.stringify(legacy), "utf8");
    const loaded = loadConfig(home);
    expect(loaded).toEqual({
      ...DEFAULT_CONFIG,
      browser: { executablePath: "C:/browser.exe" },
    });
    expect(JSON.stringify(loaded)).not.toContain(secret);
    expect(await readFile(join(home, "config.json"), "utf8")).toBe(
      JSON.stringify(legacy),
    );
    expect(inspectConfig(home)).toEqual({ exists: true, version: 1 });
  });

  it("inspectConfig 仅识别非法 v1 的版本，不回传旧字段", async () => {
    const home = await makeHome();
    const secret = "SECRET-inspect-invalid-v1-29";
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({
        version: 1,
        browser: { executablePath: { value: secret } },
        zhihu: { developerAccessSecret: secret },
      }),
      "utf8",
    );

    const inspection = inspectConfig(home);
    expect(inspection).toEqual({ exists: true, version: 1 });
    expect(JSON.stringify(inspection)).not.toContain(secret);
    try {
      loadConfig(home);
      expect.unreachable("非法 v1 浏览器路径应拒绝加载");
    } catch (error) {
      const failure = error as LeafPressError;
      expect(failure.code).toBe("CONFIG_INVALID");
      expect(failure.message).not.toContain(secret);
      expect(failure.hint ?? "").not.toContain(secret);
    }
  });

  it("写入先校验、原子替换并使用两空格缩进和末尾换行", async () => {
    const home = await makeHome();
    writeConfig(home, validConfig());
    expect(loadConfig(home)).toEqual(validConfig());
    expect((await readdir(home)).sort()).toEqual(["config.json"]);

    const updated = { ...validConfig(), server: { port: 5555 } };
    writeConfig(home, updated);
    const original = await readFile(join(home, "config.json"), "utf8");
    expect(original).toBe(`${JSON.stringify(updated, null, 2)}\n`);
    expect(loadConfig(home)).toEqual(updated);

    expect(() =>
      writeConfig(home, { ...validConfig(), server: { port: 99999 } }),
    ).toThrowError(LeafPressError);
    expect(await readFile(join(home, "config.json"), "utf8")).toBe(original);

    const invalidWriteSecret = "SECRET-invalid-write-value-71";
    let writeFailure: unknown;
    try {
      writeConfig(home, {
        ...validConfig(),
        unexpected: invalidWriteSecret,
      } as LeafPressConfig);
    } catch (error) {
      writeFailure = error;
    }
    expect(writeFailure).toBeInstanceOf(LeafPressError);
    expect((writeFailure as LeafPressError).code).toBe("CONFIG_INVALID");
    expect((writeFailure as LeafPressError).message).not.toContain(
      invalidWriteSecret,
    );
    expect((writeFailure as LeafPressError).hint ?? "").not.toContain(
      invalidWriteSecret,
    );
    expect(await readFile(join(home, "config.json"), "utf8")).toBe(original);
  });

  it("writeConfigIfAbsent 不覆盖已有配置", async () => {
    const home = await makeHome();
    const first = writeConfigIfAbsent(home, validConfig());
    expect(first).toEqual({ created: true, path: join(home, "config.json") });
    const before = await readFile(first.path, "utf8");
    expect(writeConfigIfAbsent(home, DEFAULT_CONFIG)).toEqual({
      created: false,
      path: first.path,
    });
    expect(await readFile(first.path, "utf8")).toBe(before);
  });

  it("显式升级 v1 时先保留原文件备份再写 v2；新配置不迁移旧字段", async () => {
    const home = await makeHome();
    const secret = "SECRET-backup-only-b88";
    const original = JSON.stringify({
      version: 1,
      zhihu: { developerAccessSecret: secret },
      browser: {},
    });
    await writeFile(join(home, "config.json"), original, "utf8");
    const result = upgradeLegacyConfig(home);
    expect(result.upgraded).toBe(true);
    expect(result.backupPath).toBe(join(home, "config.v1.json.bak"));
    expect(await readFile(result.backupPath!, "utf8")).toBe(original);
    expect(JSON.stringify(result)).not.toContain(secret);
    if (process.platform !== "win32")
      expect(statSync(result.backupPath!).mode & 0o777).toBe(0o600);
    expect(loadConfig(home)).toEqual(DEFAULT_CONFIG);
    expect(await readFile(join(home, "config.json"), "utf8")).not.toContain(
      secret,
    );
    expect(upgradeLegacyConfig(home)).toEqual({ upgraded: false });
  });

  it("升级备份文件名冲突时使用带时间戳的新文件名", async () => {
    const home = await makeHome();
    await writeFile(join(home, "config.v1.json.bak"), "existing", "utf8");
    await writeFile(
      join(home, "config.json"),
      '{"version":1,"browser":{}}',
      "utf8",
    );
    const result = upgradeLegacyConfig(home);
    expect(result.upgraded).toBe(true);
    expect(result.backupPath).toMatch(/config\.v1\.json\.bak-\d{8}-\d{6}$/);
    expect(await readFile(result.backupPath!, "utf8")).toBe(
      '{"version":1,"browser":{}}',
    );
  });

  it("v2 配置不被升级函数改动", async () => {
    const home = await makeHome();
    const raw = JSON.stringify(validConfig());
    await writeFile(join(home, "config.json"), raw, "utf8");
    expect(upgradeLegacyConfig(home)).toEqual({ upgraded: false });
    expect(await readFile(join(home, "config.json"), "utf8")).toBe(raw);
  });
});
