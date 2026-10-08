import { existsSync, statSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { inspectStore } from "../../src/store/inspect.js";
import { sha256File } from "../../src/shared/hash.js";

async function withTempDir<T>(
  run: (directory: string) => T | Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-store-inspect-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("只读检查记录库", () => {
  it("文件不存在时不创建目录或数据库", async () => {
    await withTempDir((directory) => {
      const missing = join(directory, "not-created", "store.sqlite");
      expect(inspectStore(missing, 1)).toEqual({
        exists: false,
        expectedVersion: 1,
      });
      expect(existsSync(join(directory, "not-created"))).toBe(false);
      expect(existsSync(missing)).toBe(false);
    });
  });

  it("0 字节库文件按版本 0 报告且不作修改", async () => {
    await withTempDir(async (directory) => {
      const dbFile = join(directory, "store.sqlite");
      await writeFile(dbFile, Buffer.alloc(0));
      const filesBefore = (await readdir(directory)).sort();

      expect(inspectStore(dbFile, 2)).toEqual({
        exists: true,
        version: 0,
        expectedVersion: 2,
      });
      expect((await readdir(directory)).sort()).toEqual(filesBefore);
      expect(statSync(dbFile).size).toBe(0);
    });
  });

  it("只读返回版本且检查前后文件哈希相同", async () => {
    await withTempDir(async (directory) => {
      const dbFile = join(directory, "store.sqlite");
      const db = new DatabaseSync(dbFile);
      db.exec("PRAGMA user_version = 1");
      db.close();
      const filesBefore = (await readdir(directory)).sort();
      const before = await sha256File(dbFile);

      expect(inspectStore(dbFile, 1)).toEqual({
        exists: true,
        version: 1,
        expectedVersion: 1,
      });
      expect((await readdir(directory)).sort()).toEqual(filesBefore);
      expect(await sha256File(dbFile)).toBe(before);
    });
  });

  it("WAL 含未并回的 user_version 时只读 SQLite 并保持目录不变", async () => {
    await withTempDir(async (directory) => {
      const dbFile = join(directory, "store.sqlite");
      const writer = new DatabaseSync(dbFile);
      try {
        writer.exec("PRAGMA journal_mode = WAL");
        writer.exec("CREATE TABLE inspect_wal (value TEXT)");
        writer.exec("PRAGMA user_version = 3");
        writer.prepare("INSERT INTO inspect_wal VALUES (?)").run("wal");
        expect(statSync(`${dbFile}-wal`).size).toBeGreaterThan(0);
        const filesBefore = (await readdir(directory)).sort();

        expect(inspectStore(dbFile, 1)).toEqual({
          exists: true,
          version: 3,
          expectedVersion: 1,
        });
        expect((await readdir(directory)).sort()).toEqual(filesBefore);
      } finally {
        writer.close();
      }
    });
  });

  it("无 WAL 时从 SQLite 文件头读取非默认 user_version", async () => {
    await withTempDir((directory) => {
      const dbFile = join(directory, "store.sqlite");
      const writer = new DatabaseSync(dbFile);
      writer.exec("PRAGMA user_version = 3");
      writer.close();

      expect(inspectStore(dbFile, 1)).toEqual({
        exists: true,
        version: 3,
        expectedVersion: 1,
      });
    });
  });

  it("文件头魔数无效时抛 STORE_FAILED", async () => {
    await withTempDir(async (directory) => {
      const dbFile = join(directory, "invalid.sqlite");
      await writeFile(dbFile, Buffer.alloc(100, 0x41));
      expect(() => inspectStore(dbFile, 1)).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
    });
  });
});
