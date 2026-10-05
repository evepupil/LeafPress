import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, writeConfigIfAbsent } from "../../src/config/load.js";
import type { LeafPressConfig } from "../../src/config/schema.js";
import { LeafPressError } from "../../src/shared/errors.js";

/**
 * 故障注入开关：测原子提交的失败路径用。
 * vi.mock 把 fs/promises 的 link / writeFile 换成会看这个开关的包装：
 * script 非 null 时第 script.skip+1 次调用开始抛 script.code 错误，之前照常放行。
 */
interface FaultScript {
  code: string;
  skip: number;
  /** 已经拦到过的调用次数；由 injectFsError 建脚本时清零 */
  calls: number;
}
const faultScripts: {
  link?: FaultScript | null;
  writeFile?: FaultScript | null;
} = {};

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  const wrap = <A extends unknown[]>(
    name: "link" | "writeFile",
    real: (...args: A) => Promise<unknown>,
  ) => {
    // 计数器挂在脚本上，injectFsError 换脚本时一并清零，
    // 避免「上一条脚本计数器残留导致新脚本跳过位置不对」
    return (...args: A): Promise<unknown> => {
      const script = faultScripts[name];
      if (script) {
        if (script.calls >= script.skip) {
          script.calls += 1;
          const failure = new Error(`${name} 注入失败`) as Error & {
            code: string;
          };
          failure.code = script.code;
          return Promise.reject(failure);
        }
        script.calls += 1;
      }
      return real(...args);
    };
  };
  return {
    ...actual,
    link: wrap("link", actual.link),
    writeFile: wrap("writeFile", actual.writeFile),
  };
});

/** 给某个函数挂上故障脚本：第 skip+1 次调用开始报错；返回摘除函数 */
function injectFsError(
  method: "link" | "writeFile",
  code: string,
  skip = 0,
): () => void {
  faultScripts[method] = { code, skip, calls: 0 };
  return () => {
    faultScripts[method] = null;
  };
}

/** 每个用例自己建目录，afterEach 逐个删掉，不留垃圾 */
const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

// 兜底：万一某个用例中断没清干净，结束时再扫一次
afterAll(async () => {
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

/** 建一个临时 home 目录（自动登记清理） */
async function makeHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "leafpress-config-"));
  dirs.push(dir);
  return dir;
}

/** 一个合法的最小配置 */
const VALID = {
  version: 1,
  blog: {
    repoPath: "C:/code/some-blog",
    contentDir: "content/posts",
    remote: "origin",
    branch: "main",
    primaryLocaleDir: "zh",
    siteUrl: "https://example.com",
  },
  materials: { projects: ["C:/code/project-a"] },
  zhihu: {},
  browser: {},
} as const;

const asConfig = (value: unknown): LeafPressConfig =>
  JSON.parse(JSON.stringify(value)) as LeafPressConfig;

describe("loadConfig：读配置", () => {
  it("文件不存在时抛 CONFIG_MISSING，hint 提示先 init", async () => {
    const dir = await makeHome();
    try {
      await loadConfig(dir);
      expect.unreachable("应该抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(LeafPressError);
      const e = error as LeafPressError;
      expect(e.code).toBe("CONFIG_MISSING");
      expect(e.message).toContain("config.json");
      expect(e.hint).toBe("先运行 leafpress init");
    }
  });

  it("JSON 损坏时抛 CONFIG_INVALID，message 说明不是合法 JSON，cause 不含输入片段", async () => {
    const dir = await makeHome();
    // 密钥值故意埋在文件开头：如果 cause.message 带输入片段就会露馅
    const raw = `"SECRET-leak-via-cause-zz9" { 不是JSON`;
    await writeFile(join(dir, "config.json"), raw, "utf8");
    try {
      await loadConfig(dir);
      expect.unreachable("应该抛错");
    } catch (error) {
      const e = error as LeafPressError;
      expect(e).toBeInstanceOf(LeafPressError);
      expect(e.code).toBe("CONFIG_INVALID");
      expect(e.message).toContain("JSON");
      expect(e.hint ?? "").not.toContain("SECRET-leak-via-cause-zz9");
      // cause 要么没有，要么存在但里面（含 message）也不带原始输入
      if (e.cause !== undefined) {
        // cause 要么是 Error（取 message），要么序列化成 JSON 再检查
        const causeText =
          e.cause instanceof Error ? e.cause.message : JSON.stringify(e.cause);
        expect(causeText).not.toContain("SECRET-leak-via-cause-zz9");
        expect(causeText).not.toContain("不是JSON");
      }
    }
  });

  it("开头带 UTF-8 BOM 时能正常读：合法配置原样读回", async () => {
    const dir = await makeHome();
    const raw = `\uFEFF${JSON.stringify(VALID)}`;
    await writeFile(join(dir, "config.json"), raw, "utf8");
    const loaded = await loadConfig(dir);
    expect(loaded).toEqual(asConfig(VALID));
  });

  it("开头带 UTF-8 BOM 且 JSON 损坏时仍抛 CONFIG_INVALID，而不是被 BOM 蒙混过关", async () => {
    const dir = await makeHome();
    await writeFile(join(dir, "config.json"), `\uFEFF{ 坏掉的`, "utf8");
    await expect(loadConfig(dir)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("出现未知字段时抛 CONFIG_INVALID，message 报出字段路径", async () => {
    const dir = await makeHome();
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({
        version: 1,
        blog: { repoPath: "C:/b", remotes: "拼错的名字" },
      }),
      "utf8",
    );
    try {
      await loadConfig(dir);
      expect.unreachable("应该抛错");
    } catch (error) {
      const e = error as LeafPressError;
      expect(e.code).toBe("CONFIG_INVALID");
      expect(e.message).toContain("blog.remotes");
    }
  });

  it("siteUrl 不合法时抛 CONFIG_INVALID，message 用中文说明", async () => {
    const dir = await makeHome();
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({
        version: 1,
        blog: { repoPath: "C:/b", siteUrl: "example.com 没有协议" },
      }),
      "utf8",
    );
    try {
      await loadConfig(dir);
      expect.unreachable("应该抛错");
    } catch (error) {
      const e = error as LeafPressError;
      expect(e.code).toBe("CONFIG_INVALID");
      expect(e.message).toContain("blog.siteUrl");
      expect(e.message).toContain("不是合法的网址");
    }
  });

  it("缺省字段自动补默认值", async () => {
    const dir = await makeHome();
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({ version: 1, blog: { repoPath: "C:/b" } }),
      "utf8",
    );
    const config = await loadConfig(dir);
    expect(config.blog.contentDir).toBe("content/posts");
    expect(config.blog.remote).toBe("origin");
    expect(config.blog.branch).toBe("main");
    expect(config.blog.primaryLocaleDir).toBe("zh");
    expect(config.blog.siteUrl).toBeUndefined();
    expect(config.materials).toEqual({ projects: [] });
    expect(config.zhihu).toEqual({});
    expect(config.browser).toEqual({});
  });

  it("正常配置原样读回", async () => {
    const dir = await makeHome();
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({
        version: 1,
        blog: { repoPath: VALID.blog.repoPath },
        materials: VALID.materials,
      }),
      "utf8",
    );
    const config = await loadConfig(dir);
    expect(config.version).toBe(1);
    expect(config.blog.repoPath).toBe("C:/code/some-blog");
    expect(config.materials.projects).toEqual(["C:/code/project-a"]);
  });
});

describe("loadConfig：校验失败不泄露字段值", () => {
  it("值很特别的字段写错类型时，message 里只有字段路径和问题，没有值", async () => {
    const dir = await makeHome();
    // 这些值一看就是故意挑的，如果出现在错误信息里就是泄漏
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({
        version: 1,
        blog: {
          repoPath: { nested: "LEAK-repoPath-value-zz9" },
          siteUrl: "LEAK-siteUrl-value-zz9",
          contentDir: 42,
        },
        zhihu: { developerAccessSecret: 12345 },
      }),
      "utf8",
    );
    try {
      await loadConfig(dir);
      expect.unreachable("应该抛错");
    } catch (error) {
      const e = error as LeafPressError;
      expect(e.code).toBe("CONFIG_INVALID");
      expect(e.message).toContain("blog.repoPath");
      expect(e.message).toContain("blog.siteUrl");
      expect(e.message).not.toContain("LEAK-repoPath-value-zz9");
      expect(e.message).not.toContain("LEAK-siteUrl-value-zz9");
      expect(e.message).not.toContain("12345");
    }
  });
});

describe("writeConfigIfAbsent：首次写配置", () => {
  it("目录不存在时先建目录再写入，格式为两空格缩进加末尾换行", async () => {
    const home = await makeHome();
    const nested = join(home, "not-yet-created");
    const config = asConfig(VALID);
    const result = await writeConfigIfAbsent(nested, config);

    expect(result.created).toBe(true);
    expect(result.path).toBe(join(nested, "config.json"));

    const raw = await readFile(result.path, "utf8");
    expect(raw.startsWith('{\n  "version": 1,')).toBe(true);
    expect(raw.endsWith("\n")).toBe(true);

    // 写出来的内容能原样读回
    const loaded = await loadConfig(nested);
    expect(loaded).toEqual(config);
  });

  it("写完后不留临时文件", async () => {
    const home = await makeHome();
    await writeConfigIfAbsent(home, asConfig(VALID));
    const entries = await readdir(home);
    expect(
      entries.every((name) => !name.includes(".tmp-")),
      `不应有临时文件残留，实际：${entries.join("、")}`,
    ).toBe(true);
    expect(entries).toContain("config.json");
  });

  it("文件已存在时不动它，返回 created: false", async () => {
    const home = await makeHome();
    const existing = "手改过的内容";
    await writeFile(join(home, "config.json"), existing, "utf8");
    const result = await writeConfigIfAbsent(home, asConfig(VALID));

    expect(result.created).toBe(false);
    expect(await readFile(join(home, "config.json"), "utf8")).toBe(existing);
  });

  it("并发调用两次只有一次 created: true，另一次 created: false 且不抛错", async () => {
    const home = await makeHome();
    const config = asConfig(VALID);
    // 同目录并发两次「首次写入」，不能互抛错误
    const results = await Promise.all([
      writeConfigIfAbsent(home, config),
      writeConfigIfAbsent(home, config),
    ]);
    expect(results.map((r) => r.created).sort()).toEqual([false, true]);

    // 内容是完整的合法配置（两轮写入内容相同，谁赢都一样）
    const loaded = await loadConfig(home);
    expect(loaded).toEqual(config);
  });

  it("传入不合法的配置抛 LeafPressError(CONFIG_INVALID)，message 逐条列字段路径且不含值，不写文件", async () => {
    const home = await makeHome();
    const bad = {
      version: 2,
      blog: { repoPath: "" },
    } as unknown as LeafPressConfig;
    try {
      await writeConfigIfAbsent(home, bad);
      expect.unreachable("应该抛错");
    } catch (error) {
      const e = error as LeafPressError;
      expect(e).toBeInstanceOf(LeafPressError);
      expect(e.code).toBe("CONFIG_INVALID");
      expect(e.message).toContain("version");
      expect(e.message).toContain("blog.repoPath");
      // 不能是 zod 原始异常（到了命令行会变成「内部错误」加 JSON）
      expect(e.message).not.toContain("Expected");
      expect(e.message).not.toContain("received");
    }
    try {
      await loadConfig(home);
      expect.unreachable("文件不应该被写出来");
    } catch (error) {
      // 没写出来：还是 CONFIG_MISSING
      expect((error as LeafPressError).code).toBe("CONFIG_MISSING");
    }
  });

  it("写入前校验不过时 message 不含字段值（值可能是密钥）", async () => {
    const home = await makeHome();
    const bad = {
      version: 1,
      blog: { repoPath: "LEAK-repo-zz9", siteUrl: "LEAK-url-zz9" },
      zhihu: { developerAccessSecret: "LEAK-secret-zz9" },
    } as unknown as LeafPressConfig;
    try {
      await writeConfigIfAbsent(home, bad);
      expect.unreachable("应该抛错");
    } catch (error) {
      const e = error as LeafPressError;
      expect(e.code).toBe("CONFIG_INVALID");
      expect(e.message).not.toContain("LEAK-repo-zz9");
      expect(e.message).not.toContain("LEAK-url-zz9");
      expect(e.message).not.toContain("LEAK-secret-zz9");
    }
  });

  it("link 报 ENOTSUP 时走退路排他写入，能正常创建", async () => {
    const home = await makeHome();
    const config = asConfig(VALID);
    const restore = injectFsError("link", "ENOTSUP");
    try {
      const result = await writeConfigIfAbsent(home, config);
      expect(result.created).toBe(true);
      const loaded = await loadConfig(home);
      expect(loaded).toEqual(config);
    } finally {
      restore();
    }
  });

  it("退路写入报 EIO 时抛出错误，且目标、临时文件都不残留", async () => {
    const home = await makeHome();
    const restoreLink = injectFsError("link", "ENOTSUP");
    // 第 1 次 writeFile（写临时文件）放行，第 2 次（退路写目标）报 EIO
    const restoreWrite = injectFsError("writeFile", "EIO", 1);
    try {
      await expect(
        writeConfigIfAbsent(home, asConfig(VALID)),
      ).rejects.toMatchObject({ code: "EIO" });
    } finally {
      restoreLink();
      restoreWrite();
    }
    // 半截 config.json 必须清掉，否则后续 init 会误判「已存在」
    const entries = await readdir(home);
    expect(entries).toEqual([]);
  });

  it("link 报 EPERM 时直接抛错不走退路，目标文件不存在", async () => {
    const home = await makeHome();
    const restoreLink = injectFsError("link", "EPERM");
    // 第 1 次 writeFile（写临时文件）放行；退路若被走到，第 2 次会报 EIO。
    // 断言抛出的是 link 的 EPERM 而不是 EIO，就说明没走退路
    const restoreWrite = injectFsError("writeFile", "EIO", 1);
    try {
      await expect(
        writeConfigIfAbsent(home, asConfig(VALID)),
      ).rejects.toMatchObject({ code: "EPERM" });
    } finally {
      restoreLink();
      restoreWrite();
    }
    expect(await readdir(home)).toEqual([]);
  });
});
