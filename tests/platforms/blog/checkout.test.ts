import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  blogCheckoutDir,
  prepareCheckout,
} from "../../../src/platforms/blog/checkout.js";
import { stubCleanSshEnv } from "./git-env-support.js";
import {
  type BlogFixture,
  exists,
  failure,
  makeBlogFixture,
  ok,
} from "./steps-fixtures.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function prepare(fixture: BlogFixture, installDeps?: boolean) {
  return prepareCheckout({
    repo: fixture.repo,
    dir: fixture.checkoutDir,
    exec: fixture.ctx.exec,
    heartbeat: () => {
      fixture.ctx.heartbeat();
    },
    ...(installDeps === undefined ? {} : { installDeps }),
  });
}

/** 夹具关闭前，作者工作区必须和开始时一个字节不差 */
async function withFixture(
  run: (fixture: BlogFixture) => Promise<void>,
): Promise<void> {
  const fixture = await makeBlogFixture();
  try {
    const before = await fixture.snapshotAuthor();
    await run(fixture);
    expect(await fixture.snapshotAuthor()).toEqual(before);
  } finally {
    await fixture.close();
  }
}

function normalized(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

describe("blogCheckoutDir", () => {
  it("放在数据目录的 blog-checkout/<账号编号>", () => {
    expect(normalized(blogCheckoutDir("/data/home", "blog-1"))).toBe(
      "/data/home/blog-checkout/blog-1",
    );
  });

  it("账号编号不安全时拒绝，防止拼出数据目录以外的路径", () => {
    expect(() => blogCheckoutDir("/data/home", "../evil")).toThrow();
  });
});

describe("prepareCheckout（临时仓库 + 本地裸仓库当线上）", () => {
  it("第一次：建 worktree、装依赖，返回线上 main 的提交号", async () => {
    await withFixture(async (fixture) => {
      const { base } = await prepare(fixture);

      expect(base).toBe(await fixture.remoteHead());
      expect(
        await fixture.git(["rev-parse", "HEAD"], fixture.checkoutDir),
      ).toBe(base);
      expect(await exists(join(fixture.checkoutDir, ".git"))).toBe(true);
      expect(
        normalized(await fixture.git(["worktree", "list", "--porcelain"])),
      ).toContain(normalized(fixture.checkoutDir));
      const installs = fixture.pnpm.callsOf("install");
      expect(installs).toHaveLength(1);
      expect(installs[0]?.args).toEqual([
        "install",
        "--frozen-lockfile",
        "--offline",
      ]);
      expect(normalized(installs[0]?.cwd ?? "")).toBe(
        normalized(fixture.checkoutDir),
      );
      expect(await exists(join(fixture.checkoutDir, "node_modules"))).toBe(
        true,
      );
      expect(fixture.heartbeats).toBeGreaterThanOrEqual(2);
    });
  }, 60_000);

  it("fetch 带不弹提示的环境变量和 2 分钟超时", async () => {
    await withFixture(async (fixture) => {
      // 屏蔽本机的 ssh 设置，才能精确断言缺省值
      stubCleanSshEnv(fixture.base);
      await prepare(fixture);

      const fetch = fixture.gitCalls.find((call) =>
        call.args.includes("fetch"),
      );
      expect(fetch?.options?.env?.["GIT_TERMINAL_PROMPT"]).toBe("0");
      expect(fetch?.options?.env?.["GIT_SSH_COMMAND"]).toBe(
        "ssh -o BatchMode=yes",
      );
      expect(fetch?.options?.env?.["GCM_INTERACTIVE"]).toBe("never");
      expect(fetch?.options?.timeoutMs).toBe(120_000);
      expect(fetch?.options?.killTree).toBe(true);
    });
  }, 60_000);

  it("第二次：重置到线上最新，垃圾和改动被清掉，node_modules 保留且不重装", async () => {
    await withFixture(async (fixture) => {
      await prepare(fixture);
      const dir = fixture.checkoutDir;
      await writeFile(join(dir, "garbage.txt"), "垃圾\n", "utf8");
      await writeFile(join(dir, "README.md"), "被改了\n", "utf8");
      await writeFile(join(dir, "staged.txt"), "暂存的\n", "utf8");
      await fixture.git(["add", "staged.txt"], dir);
      await mkdir(join(dir, ".next"), { recursive: true });
      await writeFile(join(dir, ".next", "cache.bin"), "构建缓存", "utf8");
      await writeFile(join(dir, "node_modules", ".fake", "keep.txt"), "留着");
      await fixture.git(["commit", "-m", "上次留下的半截提交"], dir);

      const { base } = await prepare(fixture);

      expect(await exists(join(dir, "garbage.txt"))).toBe(false);
      expect(await exists(join(dir, "staged.txt"))).toBe(false);
      expect(await exists(join(dir, ".next"))).toBe(false);
      expect(await readFile(join(dir, "README.md"), "utf8")).toBe("初始\n");
      expect(await fixture.git(["rev-parse", "HEAD"], dir)).toBe(base);
      expect(await fixture.git(["status", "--porcelain"], dir)).toBe(
        "?? .leafpress-lock-hash",
      );
      expect(
        await readFile(join(dir, "node_modules", ".fake", "keep.txt"), "utf8"),
      ).toBe("留着");
      expect(fixture.pnpm.callsOf("install")).toHaveLength(1);
    });
  }, 60_000);

  it("线上前进了：检出到新提交；pnpm-lock.yaml 变了才重装依赖", async () => {
    await withFixture(async (fixture) => {
      const first = await prepare(fixture);

      const moved = await fixture.pushFromElsewhere(
        { "content/posts/zh/new-one.mdx": "新文章\n" },
        "别人发了一篇",
      );
      const second = await prepare(fixture);
      expect(second.base).toBe(moved);
      expect(second.base).not.toBe(first.base);
      expect(
        await exists(join(fixture.checkoutDir, "content/posts/zh/new-one.mdx")),
      ).toBe(true);
      expect(fixture.pnpm.callsOf("install")).toHaveLength(1);

      await fixture.pushFromElsewhere(
        { "pnpm-lock.yaml": "lockfileVersion: '9.0'\n# 依赖变了\n" },
        "升级依赖",
      );
      await prepare(fixture);
      expect(fixture.pnpm.callsOf("install")).toHaveLength(2);

      await prepare(fixture);
      expect(fixture.pnpm.callsOf("install")).toHaveLength(2);
    });
  }, 60_000);

  it("node_modules 被删了也会重装", async () => {
    await withFixture(async (fixture) => {
      await prepare(fixture);
      await rm(join(fixture.checkoutDir, "node_modules"), { recursive: true });

      await prepare(fixture);

      expect(fixture.pnpm.callsOf("install")).toHaveLength(2);
      expect(await exists(join(fixture.checkoutDir, "node_modules"))).toBe(
        true,
      );
    });
  }, 60_000);

  it("installDeps 为 false：只 fetch 和准备目录，不装依赖", async () => {
    await withFixture(async (fixture) => {
      const { base } = await prepare(fixture, false);

      expect(base).toBe(await fixture.remoteHead());
      expect(fixture.pnpm.calls).toEqual([]);
      expect(await exists(join(fixture.checkoutDir, "node_modules"))).toBe(
        false,
      );
      expect(await exists(join(fixture.checkoutDir, "README.md"))).toBe(true);
    });
  }, 60_000);

  it("离线装不上就再试优先离线；两种都不行报「依赖装不上」", async () => {
    await withFixture(async (fixture) => {
      fixture.pnpm.on("install", ({ args }) =>
        args.includes("--offline") ? failure("离线缓存不全") : ok(),
      );
      await prepare(fixture);
      expect(fixture.pnpm.callsOf("install").map((call) => call.args)).toEqual([
        ["install", "--frozen-lockfile", "--offline"],
        ["install", "--frozen-lockfile", "--prefer-offline"],
      ]);
    });

    await withFixture(async (fixture) => {
      fixture.pnpm.fail("install", "ERR_PNPM_NO_OFFLINE_TARBALL");
      await expect(prepare(fixture)).rejects.toThrow(
        /^博客的依赖装不上：先在博客仓库里运行 pnpm install/,
      );
    });
  }, 60_000);

  it("检出目录不是 worktree（里面是别的东西）：推倒重建", async () => {
    await withFixture(async (fixture) => {
      await mkdir(fixture.checkoutDir, { recursive: true });
      await writeFile(join(fixture.checkoutDir, "stray.txt"), "不该在这\n");

      const { base } = await prepare(fixture);

      expect(await exists(join(fixture.checkoutDir, "stray.txt"))).toBe(false);
      expect(
        await fixture.git(["rev-parse", "HEAD"], fixture.checkoutDir),
      ).toBe(base);
    });
  }, 60_000);

  it("检出目录的 .git 被删坏了：自动重建", async () => {
    await withFixture(async (fixture) => {
      await prepare(fixture);
      await rm(join(fixture.checkoutDir, ".git"), { force: true });

      const { base } = await prepare(fixture);

      expect(
        await fixture.git(["rev-parse", "HEAD"], fixture.checkoutDir),
      ).toBe(base);
      expect(await exists(join(fixture.checkoutDir, "README.md"))).toBe(true);
    });
  }, 60_000);

  it("检出目录落在别的仓库里：不会对那个仓库 checkout / clean，别人的改动原样保留", async () => {
    await withFixture(async (fixture) => {
      const victim = join(fixture.base, "victim");
      await fixture.git(["clone", fixture.remote, victim], fixture.base);
      await writeFile(join(victim, "README.md"), "别人改到一半\n", "utf8");
      await writeFile(join(victim, "precious.txt"), "没跟踪的重要文件\n");
      const dir = join(victim, "sub", "checkout");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "stray.txt"), "占着位置\n");

      await prepareCheckout({
        repo: fixture.repo,
        dir,
        exec: fixture.ctx.exec,
        installDeps: false,
      });

      expect(await readFile(join(victim, "README.md"), "utf8")).toBe(
        "别人改到一半\n",
      );
      expect(await readFile(join(victim, "precious.txt"), "utf8")).toBe(
        "没跟踪的重要文件\n",
      );
      expect(await exists(join(dir, "stray.txt"))).toBe(false);
      expect(await exists(join(dir, "README.md"))).toBe(true);
    });
  }, 60_000);

  it("fetch 失败：报错并说明，不建检出目录", async () => {
    await withFixture(async (fixture) => {
      await fixture.git([
        "remote",
        "set-url",
        "origin",
        join(fixture.base, "不存在的远程"),
      ]);
      // 改了远程地址属于测试准备，重新取作者工作区的基准
      const before = await fixture.snapshotAuthor();

      await expect(prepare(fixture)).rejects.toThrow(/^博客仓库 fetch 失败/);

      expect(await exists(fixture.checkoutDir)).toBe(false);
      expect(await fixture.snapshotAuthor()).toEqual(before);
    });
  }, 60_000);
});
