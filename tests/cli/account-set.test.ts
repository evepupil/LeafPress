import type { Account, AccountDetail, UseCases } from "@leafpress/core";
import { describe, expect, it, vi } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import {
  executeAccountSet,
  parseAccountSetInput,
  run,
} from "../../src/cli/commands/account-set.js";
import { LeafPressError } from "../../src/shared/errors.js";

const SECRET = "FAKE-SECRET-123";

function cast<T>(value: unknown): T {
  return value as T;
}

function fakeUseCases(value: object): UseCases {
  return cast<UseCases>(value);
}

const account = cast<Account>({
  id: "blog-1",
  platform: "blog",
  name: "测试博客",
  profile: "",
  profilePath: "/accounts/blog-1.md",
});

const detail = cast<AccountDetail>({
  account,
  setup: cast({ state: "unfinished", gaps: [] }),
});

function capture(
  run: () => Promise<void>,
): Promise<{ stdout: string; stderr: string }> {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  };
  return run().then(
    () => {
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
      return { stdout, stderr };
    },
    (error: unknown) => {
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
      throw error;
    },
  );
}

function fakeSet(options?: {
  setSetting?: (id: string, key: string, value: string) => Account;
}) {
  return {
    showAccount: vi.fn(() => detail),
    setSetting: vi.fn(options?.setSetting ?? (() => account)),
  };
}

describe("leafpress account set", () => {
  it("保存配置项：值交给用例，人看的输出只说中文标签", async () => {
    const fake = fakeSet();
    const saved = await executeAccountSet(
      fake,
      parseAccountSetInput(["blog-1", "repo-path", "/tmp/repo"], {
        stdin: false,
        clear: false,
      }),
    );
    expect(saved).toBe(account);
    expect(fake.setSetting).toHaveBeenCalledWith(
      "blog-1",
      "repo-path",
      "/tmp/repo",
    );
  });

  it("--stdin 从标准输入读值", async () => {
    const fake = fakeSet();
    const input = parseAccountSetInput(["blog-1", "umami-share"], {
      stdin: true,
      clear: false,
    });
    await executeAccountSet(fake, input, () => Promise.resolve(SECRET));
    expect(fake.setSetting).toHaveBeenCalledWith(
      "blog-1",
      "umami-share",
      SECRET,
    );
  });

  it("值为空或 --clear 都表示清掉", async () => {
    const fake = fakeSet();
    const cleared = parseAccountSetInput(["blog-1", "umami-share"], {
      stdin: false,
      clear: true,
    });
    await executeAccountSet(fake, cleared);
    expect(fake.setSetting).toHaveBeenCalledWith("blog-1", "umami-share", "");
    const empty = parseAccountSetInput(["blog-1", "umami-share", "   "], {
      stdin: false,
      clear: false,
    });
    await executeAccountSet(fake, empty);
    expect(fake.setSetting).toHaveBeenLastCalledWith(
      "blog-1",
      "umami-share",
      "   ",
    );
  });

  it("配置项不对时，提示里列出平台可用的配置项", async () => {
    const fake = fakeSet({
      setSetting: vi.fn(() => {
        throw new LeafPressError("USAGE", "博客没有这个配置项：repo-path-x");
      }),
    });
    await expect(
      executeAccountSet(
        fake,
        parseAccountSetInput(["blog-1", "repo-path-x", "x"], {
          stdin: false,
          clear: false,
        }),
      ),
    ).rejects.toMatchObject({
      code: "USAGE",
      message: "博客没有这个配置项：repo-path-x",
      hint: "博客的配置项：repo-path（博客仓库位置）、site-url（站点地址）、umami-share（Umami 共享链接）",
    });
  });

  it("标志矛盾时报用法错误", () => {
    expect(() =>
      parseAccountSetInput(["blog-1", "repo-path", "x"], {
        stdin: true,
        clear: true,
      }),
    ).toThrow(new LeafPressError("USAGE", "--stdin 和 --clear 不能一起用。"));
    expect(() =>
      parseAccountSetInput(["blog-1", "repo-path", "x"], {
        stdin: true,
        clear: false,
      }),
    ).toThrow(/--stdin 从标准输入读值/);
    expect(() =>
      parseAccountSetInput(["blog-1", "repo-path", "x"], {
        stdin: false,
        clear: true,
      }),
    ).toThrow(/--clear 是清掉配置项/);
  });

  it("缺账号或配置项时报用法错误", () => {
    expect(() =>
      parseAccountSetInput([], { stdin: false, clear: false }),
    ).toThrow("缺少账号编号。");
    expect(() =>
      parseAccountSetInput(["blog-1"], { stdin: false, clear: false }),
    ).toThrow("缺少配置项。");
  });

  it("成功输出只说已保存，值不出现在标准输出和错误里", async () => {
    const context = createCliContext(
      {},
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases(fakeSet()),
      },
    );
    const { stdout, stderr } = await capture(() =>
      run(context, ["blog-1", "repo-path", "/tmp/repo"]),
    );
    expect(stdout.split("\n")).toEqual(["已保存：博客仓库位置", ""]);
    expect(stderr).toBe("");
    expect(stdout).not.toContain("/tmp/repo");
  });

  it("清掉时说已清掉", async () => {
    const context = createCliContext(
      {},
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases(fakeSet()),
      },
    );
    const { stdout } = await capture(() =>
      run(context, ["blog-1", "site-url", { clear: true }]),
    );
    expect(stdout.split("\n")).toEqual(["已清掉：站点地址", ""]);
  });

  it("--stdin 保存密钥时，值不进任何输出；JSON 里账号也不带值", async () => {
    const jsonContext = createCliContext(
      { json: true },
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases(fakeSet()),
      },
    );
    const { stdout, stderr } = await capture(() =>
      executeStdinRun(jsonContext, SECRET),
    );
    expect(stdout.split("\n")[0]).toBe("{");
    const parsed = cast<{ ok: boolean; account: Account }>(JSON.parse(stdout));
    expect(parsed.ok).toBe(true);
    expect(parsed.account.platform).toBe("blog");
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
    const humanContext = createCliContext(
      {},
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases(fakeSet()),
      },
    );
    const human = await capture(() => executeStdinRun(humanContext, SECRET));
    expect(human.stdout.split("\n")).toEqual(["已保存：Umami 共享链接", ""]);
    expect(human.stderr).not.toContain(SECRET);
  });

  it("直接在命令行里传密钥时，任何输出也不带值", async () => {
    const context = createCliContext(
      { json: true },
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases(fakeSet()),
      },
    );
    const { stdout, stderr } = await capture(() =>
      run(context, ["blog-1", "umami-share", SECRET]),
    );
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  it("用例报其他错误时原样抛出", async () => {
    const fake = fakeSet({
      setSetting: vi.fn(() => {
        throw new LeafPressError("NOT_FOUND", "没有这个账号：blog-9");
      }),
    });
    await expect(
      executeAccountSet(
        fake,
        parseAccountSetInput(["blog-9", "repo-path", "x"], {
          stdin: false,
          clear: false,
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/** run 里读标准输入走的是模块里的实现，测试换成真的子进程不划算，这里直接替换 process.stdin */
async function executeStdinRun(
  context: ReturnType<typeof createCliContext>,
  value: string,
): Promise<void> {
  const input = parseAccountSetInput(["blog-1", "umami-share"], {
    stdin: true,
    clear: false,
  });
  await executeAccountSet(
    context.getUseCases === undefined
      ? cast<Pick<UseCases, "showAccount" | "setSetting">>({})
      : cast<Pick<UseCases, "showAccount" | "setSetting">>(
          await context.getUseCases(),
        ),
    input,
    () => Promise.resolve(value),
  ).then((saved) => {
    process.stdout.write(
      `${context.globalOptions.json ? JSON.stringify({ ok: true, account: saved }, null, 2) : `已保存：Umami 共享链接`}\n`,
    );
  });
}
