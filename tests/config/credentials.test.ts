import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { openCredentials } from "../../src/config/credentials.js";
import { LeafPressError } from "../../src/shared/errors.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "leafpress-credentials-"));
  dirs.push(dir);
  return dir;
}

function runWorker(
  file: string,
  accountId: string,
  prefix: string,
  count: number,
): Promise<void> {
  const worker = fileURLToPath(
    new URL("./credential-worker.ts", import.meta.url),
  );
  const project = fileURLToPath(new URL("../../", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        worker,
        file,
        accountId,
        prefix,
        String(count),
      ],
      {
        cwd: project,
        stdio: "ignore",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `credential worker failed: ${String(code)} ${String(signal)}`,
          ),
        );
    });
  });
}

describe("账号凭证文件", () => {
  it("文件不存在时为空；增改删，删光后账号键消失", async () => {
    const file = join(await makeDir(), "credentials.json");
    const store = openCredentials(file);
    const secondStore = openCredentials(file);
    expect(store.keys("blog-2")).toEqual(new Set());
    expect(store.get("blog-2", "umami-key")).toBeUndefined();

    store.set("blog-2", "umami-key", "  secret-value-1  ");
    store.set("blog-2", "api-token", "token-value-2");
    expect(store.get("blog-2", "umami-key")).toBe("secret-value-1");
    expect(store.keys("blog-2")).toEqual(new Set(["umami-key", "api-token"]));
    store.set("blog-2", "umami-key", "secret-value-3");
    expect(secondStore.get("blog-2", "umami-key")).toBe("secret-value-3");
    secondStore.set("blog-2", "fresh-key", "fresh-value");
    expect(store.get("blog-2", "fresh-key")).toBe("fresh-value");
    secondStore.remove("blog-2", "fresh-key");
    expect(store.get("blog-2", "umami-key")).toBe("secret-value-3");

    store.remove("blog-2", "umami-key");
    expect(store.keys("blog-2")).toEqual(new Set(["api-token"]));
    store.remove("blog-2", "api-token");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      version: 1,
      accounts: {},
    });
  });

  it("空白密钥拒绝写入且错误不泄露传入内容", async () => {
    const file = join(await makeDir(), "credentials.json");
    const value = "SECRET-empty-attempt-1";
    const store = openCredentials(file);
    store.set("blog-2", "key", `  ${value}  `);
    expect(store.get("blog-2", "key")).toBe(value);
    let failure: unknown;
    try {
      store.set("blog-2", "key", "   ");
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(LeafPressError);
    expect((failure as LeafPressError).message).not.toContain(value);
    expect((failure as LeafPressError).hint ?? "").not.toContain(value);
    expect(store.keys("blog-2")).toEqual(new Set(["key"]));
  });

  it("将原型保留字作为账号和密钥名安全存储", async () => {
    const file = join(await makeDir(), "credentials.json");
    const store = openCredentials(file);
    store.set("__proto__", "constructor", "prototype-safe-secret");
    expect(store.get("__proto__", "constructor")).toBe("prototype-safe-secret");
    expect(store.keys("__proto__")).toEqual(new Set(["constructor"]));
    store.remove("__proto__", "constructor");
    expect(store.keys("__proto__")).toEqual(new Set());
  });

  it("格式损坏或结构错误时提示路径，不回显任何文件内容", async () => {
    const dir = await makeDir();
    const file = join(dir, "credentials.json");
    const secret = "SECRET-malformed-credential-66";
    await writeFile(file, `"${secret}" {`, "utf8");
    for (const action of [
      () => openCredentials(file).keys("x"),
      () => openCredentials(file).get("x", "y"),
      () => openCredentials(file).set("x", "y", secret),
      () => openCredentials(file).remove("x", "y"),
    ]) {
      try {
        action();
        expect.unreachable("应抛 CONFIG_INVALID");
      } catch (error) {
        const failure = error as LeafPressError;
        expect(failure.code).toBe("CONFIG_INVALID");
        expect(failure.message).toContain(`凭证文件格式不对：${file}`);
        expect(failure.message).not.toContain(secret);
        expect(failure.hint ?? "").not.toContain(secret);
      }
    }

    await writeFile(file, `{"version":1,"accounts":{"x":"${secret}"}}`, "utf8");
    for (const action of [
      () => openCredentials(file).keys("x"),
      () => openCredentials(file).get("x", "y"),
      () => openCredentials(file).set("x", "y", secret),
      () => openCredentials(file).remove("x", "y"),
    ]) {
      try {
        action();
        expect.unreachable("应抛 CONFIG_INVALID");
      } catch (error) {
        const failure = error as LeafPressError;
        expect(failure.code).toBe("CONFIG_INVALID");
        expect(failure.message).not.toContain(secret);
        expect(failure.hint ?? "").not.toContain(secret);
      }
    }
  });

  it("文件和临时文件使用私有权限，提交后不残留临时文件", async () => {
    const dir = await makeDir();
    const file = join(dir, "credentials.json");
    openCredentials(file).set("account", "key", "private-value");
    if (process.platform !== "win32")
      expect(statSync(file).mode & 0o777).toBe(0o600);
    expect((await readdir(dir)).sort()).toEqual(["credentials.json"]);
  });

  it("过期锁会被清理后取得", async () => {
    const dir = await makeDir();
    const file = join(dir, "credentials.json");
    const lockDir = `${file}.lock`;
    await mkdir(lockDir);
    const old = new Date(Date.now() - 60_000);
    await utimes(lockDir, old, old);
    openCredentials(file).set("account", "key", "value");
    expect(openCredentials(file).get("account", "key")).toBe("value");
  });

  it("锁被占用超过五秒时报固定 STORE_FAILED 文案", async () => {
    const dir = await makeDir();
    const file = join(dir, "credentials.json");
    await mkdir(`${file}.lock`);
    const started = Date.now();
    try {
      openCredentials(file).set("account", "key", "never-written-secret");
      expect.unreachable("锁应超时");
    } catch (error) {
      const failure = error as LeafPressError;
      expect(failure.code).toBe("STORE_FAILED");
      expect(failure.message).toBe("凭证文件正被别的进程占用。");
      expect(failure.message).not.toContain("never-written-secret");
      expect(Date.now() - started).toBeGreaterThanOrEqual(5_000);
    }
  }, 8_000);

  it("两个真实子进程各写 20 个键，最终 40 个键都保留", async () => {
    const file = join(await makeDir(), "credentials.json");
    await Promise.all([
      runWorker(file, "blog-2", "left", 20),
      runWorker(file, "blog-2", "right", 20),
    ]);
    const store = openCredentials(file);
    expect(store.keys("blog-2").size).toBe(40);
    for (const side of ["left", "right"]) {
      for (let index = 0; index < 20; index += 1) {
        expect(store.get("blog-2", `${side}-${index}`)).toBe(
          `value-${side}-${index}`,
        );
      }
    }
  }, 20_000);

  it("多进程交错写入时没有覆盖丢失", async () => {
    const file = join(await makeDir(), "credentials.json");
    const workers = Array.from({ length: 4 }, (_, index) =>
      runWorker(file, "blog-2", `parallel-${index}`, 100),
    );
    await Promise.all(workers);

    const store = openCredentials(file);
    expect(store.keys("blog-2").size).toBe(400);
    for (let worker = 0; worker < 4; worker += 1) {
      for (let index = 0; index < 100; index += 1) {
        expect(store.get("blog-2", `parallel-${worker}-${index}`)).toBe(
          `value-parallel-${worker}-${index}`,
        );
      }
    }
  }, 45_000);
});
