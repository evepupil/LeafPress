import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkZhihuOpenApi,
  loadZhihuOpenApi,
  OPENAPI_APPLY_URL,
  OPENAPI_KEY_ENV,
  OPENAPI_SECRET_ENV,
} from "../../src/config/zhihu-openapi.js";
import { LeafPressError } from "../../src/shared/errors.js";

/** 故意挑的、非常特别的密钥值，专门用来断言「不泄露」 */
const KEY = "APPKEY-zz9-unique";
const OTHER_KEY = "APPKEY-zz9-other";
const SECRET = "SECRET-zz9-unique";
const OTHER_SECRET = "SECRET-zz9-other";

/** 每个用例自己建目录，afterEach 逐个删掉，不留垃圾 */
const homes: string[] = [];

afterEach(async () => {
  while (homes.length > 0) {
    const dir = homes.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

// 兜底：万一某个用例中断没清干净，结束时再扫一次
afterAll(async () => {
  for (const dir of homes) {
    await rm(dir, { recursive: true, force: true });
  }
});

/** 建一个临时用户目录（自动登记清理） */
async function makeHomedir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "leafpress-zhihu-openapi-"));
  homes.push(dir);
  return dir;
}

/** 在临时用户目录下写共享凭证文件 */
async function writeSharedFile(
  homedir: string,
  content: unknown,
): Promise<void> {
  await mkdir(join(homedir, ".zhihu"), { recursive: true });
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  await writeFile(
    join(homedir, ".zhihu", "openapi-credentials.json"),
    raw,
    "utf8",
  );
}

const emptyEnv = {};

/**
 * 故障注入：让 readFile 对指定路径报指定错误码，其它调用照常放行。
 * 用于模拟「文件被占用 / 没权限」这类 Windows 上难以稳定制造的场景。
 */
const readFileFaults: { path: string; code: string }[] = [];

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    readFile: async (
      ...args: Parameters<typeof actual.readFile>
    ): Promise<string | Buffer> => {
      // readFile 的路径可能是 string / Buffer / URL，统一转成 string 比对；
      // FileHandle（数字文件句柄）不参与故障匹配，直接放行
      const pathArg = args[0];
      const target =
        typeof pathArg === "string"
          ? pathArg
          : Buffer.isBuffer(pathArg)
            ? pathArg.toString("utf8")
            : typeof pathArg === "object" &&
                pathArg !== null &&
                "href" in pathArg
              ? pathArg.href
              : undefined;
      const fault =
        target !== undefined
          ? readFileFaults.find((f) => f.path === target)
          : undefined;
      if (fault !== undefined) {
        const failure = new Error("readFile 注入失败") as Error & {
          code: string;
        };
        failure.code = fault.code;
        throw failure;
      }
      return actual.readFile(...args);
    },
  };
});

/** 给指定路径挂 readFile 故障，返回摘除函数 */
function injectReadError(path: string, code: string): () => void {
  readFileFaults.push({ path, code });
  return () => {
    const index = readFileFaults.findIndex((f) => f.path === path);
    if (index >= 0) {
      readFileFaults.splice(index, 1);
    }
  };
}

/** 断言一个 LeafPressError 的 message、hint、cause 都不含给定密钥值 */
function expectNoSecrets(error: unknown, secrets: readonly string[]): void {
  const e = error as LeafPressError;
  expect(e.message).toBeDefined();
  for (const secret of secrets) {
    expect(e.message).not.toContain(secret);
    expect(e.hint ?? "").not.toContain(secret);
    if (e.cause !== undefined) {
      // cause 要么是 Error（取 message），要么序列化成 JSON 再检查
      const causeText =
        e.cause instanceof Error ? e.cause.message : JSON.stringify(e.cause);
      expect(causeText).not.toContain(secret);
    }
  }
}

describe("checkZhihuOpenApi：判定顺序", () => {
  it("都没有设置 → missing，detail 写明申请入口", async () => {
    const status = await checkZhihuOpenApi({
      env: emptyEnv,
      homedir: await makeHomedir(),
    });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "missing" });
    expect(status.detail).toContain(OPENAPI_APPLY_URL);
    expect(status.source).toBeUndefined();
  });

  it("环境变量完整 → ok，来源 env", async () => {
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
      homedir: await makeHomedir(),
    });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "ok",
      source: "env",
    });
    expect(status.detail).not.toContain(KEY);
    expect(status.detail).not.toContain(SECRET);
  });

  it("文件完整 → ok，来源 file", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: SECRET,
    });
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "ok",
      source: "file",
    });
  });

  it("两边都完整但 APP_KEY 不同 → conflict，detail 只出现两个 APP_KEY，不出现 APP_SECRET", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: OTHER_KEY,
      [OPENAPI_SECRET_ENV]: SECRET,
    });
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
      homedir,
    });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "conflict" });
    expect(status.detail).toContain(KEY);
    expect(status.detail).toContain(OTHER_KEY);
    // APP_KEY 是用户名可以显示，APP_SECRET 绝不出现
    expect(status.detail).not.toContain(SECRET);
    expect(status.detail).not.toContain(OTHER_SECRET);
  });

  it("两边 APP_KEY 相同但 APP_SECRET 不同 → conflict，detail 不出现任何 APP_SECRET", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: OTHER_SECRET,
    });
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
      homedir,
    });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "conflict" });
    // 不能靠显示 APP_SECRET 区分，detail 里只能提字段名
    expect(status.detail).toContain(OPENAPI_SECRET_ENV);
    expect(status.detail).not.toContain(SECRET);
    expect(status.detail).not.toContain(OTHER_SECRET);
  });

  it("文件是坏的 JSON 且环境变量不完整 → invalid", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, "{ 坏掉的");
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY },
      homedir,
    });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "invalid" });
  });

  it("文件字段类型不对（APP_SECRET 是数字）且环境变量没有 → invalid", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: 12345,
    });
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "invalid" });
  });

  it("文件只有一个字段且类型不对（APP_KEY 是数字）、另一个字段缺失 → invalid，而不是 incomplete", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, { [OPENAPI_KEY_ENV]: 12345 });
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "invalid" });
  });

  it("文件字段是空串 → invalid（空串算「存在但不对」，不算缺失）", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: "",
    });
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "invalid" });
  });

  it("文件内容是合法 JSON 但不是对象 → invalid", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, "就一个字符串");
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "invalid" });
  });

  it("环境变量只设了 APP_KEY → incomplete，detail 说明缺哪一项", async () => {
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY },
      homedir: await makeHomedir(),
    });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "incomplete",
    });
    expect(status.detail).toContain(OPENAPI_SECRET_ENV);
    expect(status.detail).not.toContain(KEY);
  });

  it("环境变量只设了 APP_SECRET → incomplete，缺的是 APP_KEY", async () => {
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_SECRET_ENV]: SECRET },
      homedir: await makeHomedir(),
    });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "incomplete",
    });
    expect(status.detail).toContain(OPENAPI_KEY_ENV);
  });

  it("文件只有一半（合法 JSON、只缺字段）→ incomplete，说明文件里缺哪一项", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, { [OPENAPI_KEY_ENV]: KEY });
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "incomplete",
    });
    expect(status.detail).toContain(OPENAPI_SECRET_ENV);
  });

  it("环境变量一半 + 文件完整 → ok（来源 file），detail 说明环境变量被忽略", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: SECRET,
    });
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY },
      homedir,
    });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "ok",
      source: "file",
    });
    expect(status.detail).toContain("环境变量只设置了一半");
  });

  it("两边值完全一样时不算冲突，按 env 优先", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: SECRET,
    });
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
      homedir,
    });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "ok",
      source: "env",
    });
  });

  it("空串环境变量视同没设置：两边都只有空串 → missing", async () => {
    const status = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: "", [OPENAPI_SECRET_ENV]: "" },
      homedir: await makeHomedir(),
    });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "missing" });
  });

  it("共享文件是个目录（EISDIR）→ invalid 而不抛，detail 只说错误码和路径", async () => {
    const homedir = await makeHomedir();
    // 目录占住凭证文件的位置：readFile 会报 EISDIR
    await mkdir(join(homedir, ".zhihu", "openapi-credentials.json"), {
      recursive: true,
    });
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({ name: "zhihu-openapi", state: "invalid" });
    expect(status.detail).toContain("EISDIR");
    expect(status.detail).toContain("openapi-credentials.json");
    expect(status.detail).not.toContain(KEY);
    expect(status.detail).not.toContain(SECRET);
  });

  it("共享文件读不了（EACCES）→ invalid 而不抛，detail 含错误码不含文件内容", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: SECRET,
    });
    const file = join(homedir, ".zhihu", "openapi-credentials.json");
    // Windows 上改 chmod 不一定拦得住读，直接让 readFile 报 EACCES 更可靠
    const restore = injectReadError(file, "EACCES");
    try {
      const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
      expect(status).toMatchObject({ name: "zhihu-openapi", state: "invalid" });
      expect(status.detail).toContain("EACCES");
      // 读不了时 detail 不能把文件内容（密钥）报出来
      expect(status.detail).not.toContain(SECRET);
    } finally {
      restore();
    }
  });

  it("环境变量完整 + 共享文件读不了（EBUSY）→ 仍然 ok（env 优先），检查函数不抛", async () => {
    const homedir = await makeHomedir();
    await mkdir(join(homedir, ".zhihu"), { recursive: true });
    await writeFile(
      join(homedir, ".zhihu", "openapi-credentials.json"),
      "",
      "utf8",
    );
    const file = join(homedir, ".zhihu", "openapi-credentials.json");
    const restore = injectReadError(file, "EBUSY");
    try {
      const status = await checkZhihuOpenApi({
        env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
        homedir,
      });
      expect(status).toMatchObject({
        name: "zhihu-openapi",
        state: "ok",
        source: "env",
      });
    } finally {
      restore();
    }
  });

  it("共享文件开头带 UTF-8 BOM → 能正常识别，文件完整时报 ok（来源 file）", async () => {
    const homedir = await makeHomedir();
    await mkdir(join(homedir, ".zhihu"), { recursive: true });
    await writeFile(
      join(homedir, ".zhihu", "openapi-credentials.json"),
      `\uFEFF${JSON.stringify({
        [OPENAPI_KEY_ENV]: KEY,
        [OPENAPI_SECRET_ENV]: SECRET,
      })}`,
      "utf8",
    );
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status).toMatchObject({
      name: "zhihu-openapi",
      state: "ok",
      source: "file",
    });
  });
});

describe("loadZhihuOpenApi：读取凭证", () => {
  it("环境变量完整时返回 env 来源的键值", async () => {
    const loaded = await loadZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
      homedir: await makeHomedir(),
    });
    expect(loaded).toEqual({ appKey: KEY, appSecret: SECRET, source: "env" });
  });

  it("文件完整时返回 file 来源的键值", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: KEY,
      [OPENAPI_SECRET_ENV]: SECRET,
    });
    const loaded = await loadZhihuOpenApi({ env: emptyEnv, homedir });
    expect(loaded).toEqual({ appKey: KEY, appSecret: SECRET, source: "file" });
  });

  it("missing / incomplete / invalid 时抛 CREDENTIAL_MISSING", async () => {
    const home1 = await makeHomedir();
    await expect(
      loadZhihuOpenApi({ env: emptyEnv, homedir: home1 }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_MISSING" });

    const home2 = await makeHomedir();
    await expect(
      loadZhihuOpenApi({ env: { [OPENAPI_KEY_ENV]: KEY }, homedir: home2 }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_MISSING" });

    const home3 = await makeHomedir();
    await writeSharedFile(home3, "不是 JSON");
    await expect(
      loadZhihuOpenApi({ env: emptyEnv, homedir: home3 }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_MISSING" });
  });

  it("conflict 时抛 CREDENTIAL_CONFLICT，错误是 LeafPressError 且不含 APP_SECRET", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: OTHER_KEY,
      [OPENAPI_SECRET_ENV]: OTHER_SECRET,
    });
    try {
      await loadZhihuOpenApi({
        env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
        homedir,
      });
      expect.unreachable("应该抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(LeafPressError);
      expect((error as LeafPressError).code).toBe("CREDENTIAL_CONFLICT");
      expectNoSecrets(error, [SECRET, OTHER_SECRET]);
    }
  });
});

describe("不泄露：每个分支的 detail 和错误信息都不含密钥值", () => {
  /** 覆盖所有状态的输入组合 */
  const cases: Array<{
    name: string;
    env: Record<string, string>;
  }> = [
    { name: "missing", env: {} },
    {
      name: "ok-env",
      env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
    },
    {
      name: "incomplete-env-半",
      env: { [OPENAPI_KEY_ENV]: KEY },
    },
    {
      name: "incomplete-env-另一半",
      env: { [OPENAPI_SECRET_ENV]: SECRET },
    },
  ];

  for (const c of cases) {
    it(`分支 ${c.name}：detail 和抛出的错误（message、hint、cause）都不含密钥值`, async () => {
      const homedir = await makeHomedir();
      const status = await checkZhihuOpenApi({ env: c.env, homedir });
      expect(status.detail).not.toContain(KEY);
      expect(status.detail).not.toContain(SECRET);

      try {
        await loadZhihuOpenApi({ env: c.env, homedir });
      } catch (error) {
        expectNoSecrets(error, [KEY, SECRET]);
      }
    });
  }

  it("分支 ok-file / conflict（文件里有完整密钥）：detail、错误信息都不含 APP_SECRET", async () => {
    const homedir = await makeHomedir();
    await writeSharedFile(homedir, {
      [OPENAPI_KEY_ENV]: OTHER_KEY,
      [OPENAPI_SECRET_ENV]: SECRET,
    });

    // file 完整、env 没有
    const okFile = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(okFile.detail).not.toContain(SECRET);
    expect(okFile.detail).not.toContain(OTHER_KEY);

    // conflict
    const conflict = await checkZhihuOpenApi({
      env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
      homedir,
    });
    expect(conflict.state).toBe("conflict");
    // APP_KEY 可以出现，APP_SECRET 绝不出现
    expect(conflict.detail).toContain(KEY);
    expect(conflict.detail).toContain(OTHER_KEY);
    expect(conflict.detail).not.toContain(SECRET);

    try {
      await loadZhihuOpenApi({
        env: { [OPENAPI_KEY_ENV]: KEY, [OPENAPI_SECRET_ENV]: SECRET },
        homedir,
      });
      expect.unreachable("应该抛错");
    } catch (error) {
      expectNoSecrets(error, [SECRET]);
    }
  });

  it("分支 invalid（文件是坏 JSON，里面混着密钥原文）：detail 和错误（含 cause）不含密钥值", async () => {
    const homedir = await makeHomedir();
    // 坏 JSON 里故意埋上密钥原文，如果实现把文件内容拼进错误信息或 cause 就会露馅
    await writeSharedFile(homedir, `{ broken ${SECRET} ${KEY}`);
    const status = await checkZhihuOpenApi({ env: emptyEnv, homedir });
    expect(status.state).toBe("invalid");
    expect(status.detail).not.toContain(SECRET);
    expect(status.detail).not.toContain(KEY);

    try {
      await loadZhihuOpenApi({ env: emptyEnv, homedir });
      expect.unreachable("应该抛错");
    } catch (error) {
      expectNoSecrets(error, [SECRET, KEY]);
    }
  });
});
