/**
 * 检出目录的建、重建：不碰作者仓库里别的工作树。
 * 不再对作者仓库跑 git worktree prune（它会清掉作者其他工作树里「此刻路径不存在」的登记，
 * 比如放在没插上的移动硬盘上的工作树）；检出目录自己被删掉时，靠 worktree add --force 复用路径。
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareCheckout } from "../../../src/platforms/blog/checkout.js";
import { type BlogFixture, exists, makeBlogFixture } from "./steps-fixtures.js";

function prepare(fixture: BlogFixture) {
  return prepareCheckout({
    repo: fixture.repo,
    dir: fixture.checkoutDir,
    exec: fixture.ctx.exec,
    installDeps: false,
  });
}

function normalized(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

/** 作者仓库登记的所有工作树路径（规范化后） */
async function registeredWorktrees(fixture: BlogFixture): Promise<string[]> {
  const listed = await fixture.git(["worktree", "list", "--porcelain"]);
  return listed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => normalized(line.slice("worktree ".length)));
}

/** 作者仓库 .git/worktrees 里的登记文件夹名 */
async function registrationNames(fixture: BlogFixture): Promise<string[]> {
  return (await readdir(join(fixture.repo, ".git", "worktrees"))).sort();
}

/** 在作者仓库里造一个别的工作树，再把它的文件夹删掉（像放在没插上的移动硬盘上） */
async function addUnpluggedWorktree(fixture: BlogFixture): Promise<string> {
  const path = join(fixture.base, "unplugged-drive-worktree");
  await fixture.git(["worktree", "add", "--detach", path, "HEAD"]);
  await rm(path, { recursive: true, force: true });
  return path;
}

function pruneCalls(fixture: BlogFixture) {
  return fixture.gitCalls.filter(
    (call) => call.args.includes("worktree") && call.args.includes("prune"),
  );
}

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

describe("检出目录被删掉后重新准备", () => {
  it("删掉检出目录（登记还在）再准备一次能成功，路径被复用，没有重复的登记", async () => {
    await withFixture(async (fixture) => {
      await prepare(fixture);
      expect(await registrationNames(fixture)).toEqual(["blog-1"]);

      await rm(fixture.checkoutDir, { recursive: true, force: true });
      const callsBefore = fixture.gitCalls.length;
      const { base } = await prepare(fixture);

      // 第一次 add 就成功，没有退到「注销再重建」的备用路径
      const rebuilt = fixture.gitCalls
        .slice(callsBefore)
        .filter((call) => call.args.includes("remove"));
      expect(rebuilt).toEqual([]);
      expect(base).toBe(await fixture.remoteHead());
      expect(
        await fixture.git(["rev-parse", "HEAD"], fixture.checkoutDir),
      ).toBe(base);
      // 旧登记被 --force 直接复用：作者仓库里还是只有这一个登记，不会冒出 blog-11 之类的
      expect(await registrationNames(fixture)).toEqual(["blog-1"]);
      expect(
        (await registeredWorktrees(fixture)).filter(
          (path) => path === normalized(fixture.checkoutDir),
        ),
      ).toHaveLength(1);
      expect(pruneCalls(fixture)).toEqual([]);
    });
  }, 60_000);

  it("建检出目录用 worktree add --force --detach", async () => {
    await withFixture(async (fixture) => {
      await prepare(fixture);

      const add = fixture.gitCalls.find(
        (call) => call.args.includes("worktree") && call.args.includes("add"),
      );
      expect(add?.args).toEqual([
        "-C",
        fixture.repo,
        "worktree",
        "add",
        "--force",
        "--detach",
        fixture.checkoutDir,
        "origin/main",
      ]);
    });
  }, 60_000);
});

describe("作者仓库里别的工作树的登记不被清掉", () => {
  it("别的工作树路径不存在（像没插上的移动硬盘）：第一次建、删后重建、损坏后重建，它的登记一直在", async () => {
    await withFixture(async (fixture) => {
      const unplugged = await addUnpluggedWorktree(fixture);
      const stillRegistered = async (): Promise<boolean> =>
        (await registeredWorktrees(fixture)).includes(normalized(unplugged));
      expect(await stillRegistered()).toBe(true);

      // 1. 第一次建
      await prepare(fixture);
      expect(await stillRegistered()).toBe(true);
      expect(await registrationNames(fixture)).toEqual([
        "blog-1",
        "unplugged-drive-worktree",
      ]);

      // 2. 检出目录被删掉后重建
      await rm(fixture.checkoutDir, { recursive: true, force: true });
      await prepare(fixture);
      expect(await stillRegistered()).toBe(true);
      expect(await registrationNames(fixture)).toEqual([
        "blog-1",
        "unplugged-drive-worktree",
      ]);

      // 3. 检出目录被弄坏（.git 没了）后推倒重建
      await rm(join(fixture.checkoutDir, ".git"), { force: true });
      await prepare(fixture);
      expect(await stillRegistered()).toBe(true);
      expect(await exists(join(fixture.checkoutDir, "README.md"))).toBe(true);

      // 4. 检出目录里被塞了别的东西（不是工作树）后推倒重建
      await rm(fixture.checkoutDir, { recursive: true, force: true });
      await mkdir(fixture.checkoutDir, { recursive: true });
      await writeFile(join(fixture.checkoutDir, "stray.txt"), "占着位置\n");
      await prepare(fixture);
      expect(await stillRegistered()).toBe(true);
      expect(await exists(join(fixture.checkoutDir, "stray.txt"))).toBe(false);

      expect(pruneCalls(fixture)).toEqual([]);
      // 它的登记文件夹原样还在，作者回头把硬盘插上就能继续用
      expect(await registrationNames(fixture)).toContain(
        "unplugged-drive-worktree",
      );
    });
  }, 120_000);

  it("整个过程一次 worktree prune 都没跑过", async () => {
    await withFixture(async (fixture) => {
      await prepare(fixture);
      await prepare(fixture);
      await rm(fixture.checkoutDir, { recursive: true, force: true });
      await prepare(fixture);

      expect(pruneCalls(fixture)).toEqual([]);
    });
  }, 60_000);
});
