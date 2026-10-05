import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import {
  createTransactionFunctions,
  decodeJson,
  encodeJson,
} from "../../src/store/sql.js";

async function withDatabase<T>(
  fn: (db: DatabaseSync, dbFile: string) => T,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "leafpress-store-sql-"));
  const dbFile = join(directory, "store.sqlite");
  const db = new DatabaseSync(dbFile);
  try {
    return fn(db, dbFile);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
}

describe("记录库 SQL 公共件", () => {
  it("嵌套 JSON、中文和 Windows 路径可往返", async () => {
    await withDatabase(() => {
      const value = {
        title: "中文内容",
        nested: { paths: ["C:\\作品\\原稿.md", "D:\\图片\\封面.png"] },
      };
      const encoded = encodeJson(value, "runs", "params");
      expect(decodeJson<typeof value>(encoded, "runs", "params")).toEqual(
        value,
      );
      expect(decodeJson(null, "runs", "params")).toBeUndefined();
    });
  });

  it("解析损坏的 JSON 时指出表和列", async () => {
    await withDatabase(() => {
      expect(() => decodeJson("{", "run_steps", "wait")).toThrow(
        "记录库表「run_steps」的 JSON 列「wait」解析失败。",
      );
    });
  });

  it("BEGIN IMMEDIATE 等锁超时也转换为 STORE_FAILED", async () => {
    await withDatabase((db, dbFile) => {
      const contender = new DatabaseSync(dbFile);
      try {
        db.exec("PRAGMA journal_mode = WAL");
        contender.exec("PRAGMA busy_timeout = 1");
        db.exec("BEGIN IMMEDIATE");
        const transactions = createTransactionFunctions(contender);

        expect(() => transactions.transaction(() => undefined)).toThrow(
          expect.objectContaining({ code: "STORE_FAILED" }),
        );
        expect(contender.isTransaction).toBe(false);
      } finally {
        if (db.isTransaction) db.exec("ROLLBACK");
        contender.close();
      }
    });
  });

  it("事务回调返回 Promise 时回滚并提示必须同步", async () => {
    await withDatabase((db) => {
      const transactions = createTransactionFunctions(db);
      db.exec("CREATE TABLE async_values (value TEXT NOT NULL)");

      expect(() =>
        transactions.transaction(() => {
          db.prepare("INSERT INTO async_values VALUES (?)").run("rolled back");
          return Promise.resolve();
        }),
      ).toThrow(
        expect.objectContaining({
          code: "STORE_FAILED",
          message: "事务回调不能是异步函数。",
        }),
      );
      expect(db.isTransaction).toBe(false);
      expect(db.prepare("SELECT * FROM async_values").all()).toEqual([]);
    });
  });

  it("事务提交、回滚且拒绝显式嵌套", async () => {
    await withDatabase((db) => {
      const transactions = createTransactionFunctions(db);
      db.exec("CREATE TABLE values_table (value TEXT NOT NULL)");
      transactions.transaction(() => {
        db.prepare("INSERT INTO values_table VALUES (?)").run("committed");
      });

      const failure = new Error("原始错误");
      expect(() =>
        transactions.transaction(() => {
          db.prepare("INSERT INTO values_table VALUES (?)").run("rolled back");
          throw failure;
        }),
      ).toThrow(failure);
      expect(() =>
        transactions.transaction(() => transactions.transaction(() => 1)),
      ).toThrow("记录库事务不支持嵌套调用。");
      expect(db.prepare("SELECT value FROM values_table").all()).toEqual([
        { value: "committed" },
      ]);
    });
  });
});
