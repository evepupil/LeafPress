import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { homePaths } from "../../src/config/home.js";
import { loadConfig } from "../../src/config/load.js";
import { DEFAULT_CONFIG } from "../../src/config/schema.js";
import { exportBackup } from "../../src/files/export.js";
import {
  profilePath,
  profilesStamp,
  readProfile,
  writeProfile,
} from "../../src/files/profiles.js";
import { openStore } from "../../src/store/open.js";
import type { LeafPressError } from "../../src/shared/errors.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "leafpress-files-profile-"));
  dirs.push(home);
  return home;
}

function runExportWorker(home: string, resultFile: string): Promise<void> {
  const worker = fileURLToPath(new URL("./export-worker.ts", import.meta.url));
  const project = fileURLToPath(new URL("../../", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", import.meta.resolve("tsx"), worker, home, resultFile],
      { cwd: project, stdio: "ignore" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`export worker failed: ${String(code)} ${String(signal)}`),
        );
    });
  });
}

describe("账号档案", () => {
  it("读不存在的档案为空，写入去除末尾空白并保留单个换行", async () => {
    const paths = homePaths(await makeHome());
    expect(readProfile(paths, "zhihu-1")).toBe("");
    writeProfile(paths, "zhihu-1", "  写作偏好  \n\n\t");
    expect(await readFile(profilePath(paths, "zhihu-1"), "utf8")).toBe(
      "  写作偏好\n",
    );
    expect(readProfile(paths, "zhihu-1")).toBe("  写作偏好\n");
    writeProfile(paths, "zhihu-1", " \n\t");
    expect(await readFile(profilePath(paths, "zhihu-1"), "utf8")).toBe("");
  });

  it("profilesStamp 取 .md 档案最晚整数修改时间，目录不存在为 0", async () => {
    const paths = homePaths(await makeHome());
    expect(profilesStamp(paths)).toBe(0);
    writeProfile(paths, "blog-1", "one");
    const firstTime = new Date("2026-01-01T00:00:00Z");
    await utimes(profilePath(paths, "blog-1"), firstTime, firstTime);
    expect(profilesStamp(paths)).toBe(firstTime.getTime());

    await writeFile(
      join(paths.accountsDir, "ignored.txt"),
      "not a profile",
      "utf8",
    );
    writeProfile(paths, "zhihu-2", "two");
    const laterTime = new Date("2027-02-03T04:05:06Z");
    await utimes(profilePath(paths, "zhihu-2"), laterTime, laterTime);
    expect(profilesStamp(paths)).toBe(laterTime.getTime());
  });
});

describe("导出备份", () => {
  it("导出可打开且数据一致的数据库、档案和重新生成的 v2 配置，不导出密钥或旧配置备份", async () => {
    const home = await makeHome();
    const paths = homePaths(home);
    const store = openStore(paths.dbFile);
    store.accounts.insert({
      id: "zhihu-3",
      platform: "zhihu",
      name: "测试账号",
      stage: "active",
      since: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    writeProfile(paths, "zhihu-3", "账号介绍");
    const secret = "SECRET-export-never-copy-18";
    await writeFile(
      paths.configFile,
      JSON.stringify({ version: 1, zhihu: { developerAccessSecret: secret } }),
      "utf8",
    );
    await writeFile(
      join(home, "config.v1.json.bak"),
      `legacy ${secret}`,
      "utf8",
    );
    await writeFile(
      paths.credentialsFile,
      JSON.stringify({
        version: 1,
        accounts: { "zhihu-3": { token: secret } },
      }),
      "utf8",
    );

    const now = new Date(2026, 9, 8, 9, 30, 0);
    const first = exportBackup(paths, store, loadConfig(home), now);
    const second = exportBackup(paths, store, loadConfig(home), now);
    expect(first.dir).toBe(join(paths.backupsDir, "export-20261008-093000"));
    expect(second.dir).toBe(join(paths.backupsDir, "export-20261008-093000-2"));
    for (const result of [first, second]) {
      const entries = (await readdir(result.dir)).sort();
      expect(entries).toEqual(["accounts", "config.json", "leafpress.db"]);
      expect(
        await readFile(join(result.dir, "accounts", "zhihu-3.md"), "utf8"),
      ).toBe("账号介绍\n");
      const config = JSON.parse(
        await readFile(join(result.dir, "config.json"), "utf8"),
      ) as unknown;
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(JSON.stringify(config)).not.toContain(secret);

      const backupDb = openStore(join(result.dir, "leafpress.db"));
      expect(backupDb.accounts.get("zhihu-3")).toMatchObject({
        id: "zhihu-3",
        name: "测试账号",
      });
      backupDb.close();
    }
    store.close();
  });

  it("两个子进程同一秒导出时以 mkdir 冲突选择不同目录", async () => {
    const home = await makeHome();
    const results = [join(home, "result-1.txt"), join(home, "result-2.txt")];
    await Promise.all(results.map((result) => runExportWorker(home, result)));

    const exported = await Promise.all(
      results.map((result) => readFile(result, "utf8")),
    );
    expect(exported.sort()).toEqual(
      [
        join(home, "backups", "export-20261008-093000"),
        join(home, "backups", "export-20261008-093000-2"),
      ].sort(),
    );
  });

  it("导出中途失败时删除不完整目录并隐藏底层错误", async () => {
    const paths = homePaths(await makeHome());
    const secret = "SECRET-partial-export-42";
    try {
      exportBackup(
        paths,
        {
          backupTo(target) {
            writeFileSync(target, secret, "utf8");
            throw new Error(secret);
          },
        },
        DEFAULT_CONFIG,
        new Date(2026, 9, 8, 9, 30, 0),
      );
      expect.unreachable("导出应失败");
    } catch (error) {
      const failure = error as LeafPressError;
      expect(failure.code).toBe("STORE_FAILED");
      expect(failure.message).not.toContain(secret);
    }
    expect(await readdir(paths.backupsDir)).toEqual([]);
  });

  it("没档案时也输出空 accounts 目录", async () => {
    const home = await makeHome();
    const paths = homePaths(home);
    const store = openStore(paths.dbFile);
    const result = exportBackup(
      paths,
      store,
      loadConfig(home),
      new Date(2026, 0, 1),
    );
    expect(await readdir(join(result.dir, "accounts"))).toEqual([]);
    store.close();
  });
});
