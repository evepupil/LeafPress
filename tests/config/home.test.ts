import { describe, expect, it } from "vitest";
import { homedir as osHomedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { homePaths, resolveHome } from "../../src/config/home.js";
import { LeafPressError } from "../../src/shared/errors.js";

describe("resolveHome：数据目录解析", () => {
  it("优先用显式传入的目录", () => {
    const home = resolveHome({
      homeDir: "C:/code/press",
      env: { LEAFPRESS_HOME: "C:/code/other" },
      homedir: "C:/Users/someone",
    });
    expect(home).toBe(resolve("C:/code/press"));
    expect(isAbsolute(home)).toBe(true);
  });

  it("没有显式传入时用环境变量 LEAFPRESS_HOME", () => {
    const home = resolveHome({
      env: { LEAFPRESS_HOME: "C:/press-data" },
      homedir: "C:/Users/someone",
    });
    expect(home).toBe(resolve("C:/press-data"));
    expect(isAbsolute(home)).toBe(true);
  });

  it("都没有时用 <用户目录>/.leafpress", () => {
    const home = resolveHome({ homedir: "C:/Users/someone" });
    expect(home).toBe(resolve("C:/Users/someone", ".leafpress"));
    expect(isAbsolute(home)).toBe(true);
  });

  it("环境变量为空串时当没设置，落到用户目录", () => {
    expect(resolveHome({ env: { LEAFPRESS_HOME: "" }, homedir: "C:/u" })).toBe(
      resolve("C:/u", ".leafpress"),
    );
  });

  it("没传任何参数时，回落到真实的 process.env 和 os.homedir()，不报错", () => {
    // 不注入：生产路径。只要真实环境里有用户目录（Node 一定有），就该返回绝对路径
    const home = resolveHome();
    expect(isAbsolute(home)).toBe(true);
    if (process.env["LEAFPRESS_HOME"]) {
      expect(home).toBe(resolve(process.env["LEAFPRESS_HOME"]));
    } else {
      expect(home).toBe(resolve(join(osHomedir(), ".leafpress")));
    }
  });

  it("注入的 env 缺 LEAFPRESS_HOME 时，同一调用里回落到注入的 homedir", () => {
    const home = resolveHome({ env: {}, homedir: "C:/Users/someone" });
    expect(home).toBe(resolve("C:/Users/someone", ".leafpress"));
  });

  it("用户目录是空串且其他来源都没设置时，报出中文 USAGE 错误", () => {
    // 注入空串遮蔽真实环境，确保走的是 USAGE 分支而不是真实用户目录
    expect(() => resolveHome({ homedir: "" })).toThrowError(LeafPressError);
    try {
      resolveHome({ homedir: "" });
      expect.unreachable("应该抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(LeafPressError);
      expect((error as LeafPressError).code).toBe("USAGE");
      expect((error as LeafPressError).message).toContain("数据目录");
    }
  });

  it("相对路径也会转成绝对路径", () => {
    expect(isAbsolute(resolveHome({ homeDir: "relative/dir" }))).toBe(true);
  });
});

describe("homePaths：目录下各用途路径", () => {
  it("返回配置、凭证、数据库、档案、任务、备份和日志路径", () => {
    const paths = homePaths("C:/press");
    const home = resolve("C:/press");
    expect(paths).toEqual({
      home,
      configFile: resolve(home, "config.json"),
      credentialsFile: resolve(home, "credentials.json"),
      dbFile: resolve(home, "leafpress.db"),
      accountsDir: resolve(home, "accounts"),
      tasksDir: resolve(home, "tasks"),
      backupsDir: resolve(home, "backups"),
      logsDir: resolve(home, "logs"),
    });
  });
});
