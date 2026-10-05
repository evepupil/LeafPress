import { existsSync, statSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { inspectStore } from "../../src/store/inspect.js";
import { MIGRATIONS } from "../../src/store/migrations.js";
import { openStore } from "../../src/store/open.js";
import type { Migration } from "../../src/store/types.js";
import { sha256File } from "../../src/shared/hash.js";

const TEST_MIGRATIONS: readonly Migration[] = [
  ...MIGRATIONS,
  {
    version: 2,
    name: "inspect test 2",
    sql: "CREATE TABLE inspect_v2 (id TEXT);",
  },
  {
    version: 3,
    name: "inspect test 3",
    sql: "CREATE TABLE inspect_v3 (id TEXT);",
  },
];

describe("只读检查记录库", () => {
  it("文件不存在时不创建目录或数据库", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-inspect-missing-"),
    );
    const missing = join(directory, "not-created", "store.sqlite");
    try {
      expect(inspectStore(missing)).toEqual({
        exists: false,
        expectedVersion: 1,
      });
      expect(existsSync(join(directory, "not-created"))).toBe(false);
      expect(existsSync(missing)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("0 字节库文件按版本 0 报告且不作修改", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-inspect-empty-"),
    );
    const dbFile = join(directory, "store.sqlite");
    try {
      await writeFile(dbFile, Buffer.alloc(0));
      const filesBefore = (await readdir(directory)).sort();

      expect(inspectStore(dbFile)).toEqual({
        exists: true,
        version: 0,
        expectedVersion: 1,
      });
      expect((await readdir(directory)).sort()).toEqual(filesBefore);
      expect(statSync(dbFile).size).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("只读返回版本且检查前后文件哈希相同", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-inspect-existing-"),
    );
    const dbFile = join(directory, "store.sqlite");
    const store = openStore(dbFile);
    try {
      store.works.create({ title: "只读检查" });
      store.close();
      const filesBefore = (await readdir(directory)).sort();
      const before = await sha256File(dbFile);
      expect(inspectStore(dbFile)).toEqual({
        exists: true,
        version: 1,
        expectedVersion: 1,
      });
      expect((await readdir(directory)).sort()).toEqual(filesBefore);
      expect(await sha256File(dbFile)).toBe(before);
    } finally {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("WAL 含未并回的 user_version 时只读 SQLite 并保持目录不变", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-inspect-wal-"),
    );
    const dbFile = join(directory, "store.sqlite");
    const writer = openStore(dbFile, { migrations: TEST_MIGRATIONS });
    try {
      expect(writer.migration.to).toBe(3);
      const walFile = `${dbFile}-wal`;
      expect(statSync(walFile).size).toBeGreaterThan(0);
      const filesBefore = (await readdir(directory)).sort();

      expect(inspectStore(dbFile)).toEqual({
        exists: true,
        version: 3,
        expectedVersion: 1,
      });
      expect((await readdir(directory)).sort()).toEqual(filesBefore);
    } finally {
      writer.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("无 WAL 时从 SQLite 文件头读取非默认 user_version", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-inspect-version-"),
    );
    const dbFile = join(directory, "store.sqlite");
    const writer = openStore(dbFile, { migrations: TEST_MIGRATIONS });
    writer.close();
    try {
      await rm(`${dbFile}-wal`, { force: true });
      await rm(`${dbFile}-shm`, { force: true });
      expect(inspectStore(dbFile)).toEqual({
        exists: true,
        version: 3,
        expectedVersion: 1,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("文件头魔数无效时抛 STORE_FAILED", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "leafpress-store-inspect-invalid-"),
    );
    const dbFile = join(directory, "invalid.sqlite");
    try {
      await writeFile(dbFile, Buffer.alloc(100, 0x41));
      expect(() => inspectStore(dbFile)).toThrow(
        expect.objectContaining({ code: "STORE_FAILED" }),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
