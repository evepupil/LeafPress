/**
 * 博客仓库锁的释放：Windows 上别的进程正在读 owner.json 时，锁文件夹改名会被拒（EPERM）。
 * 这里把改名换成会失败的，看：重试放长了、最终失败有警告、本进程之后能再次拿到锁。
 */
import type * as FsPromises from "node:fs/promises";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 改名换成可控的、等待换成不真等，只记下每次要等多久
const hoisted = vi.hoisted(() => ({ delays: [] as number[] }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

vi.mock("node:timers/promises", () => ({
  setTimeout: (ms: number): Promise<void> => {
    hoisted.delays.push(ms);
    return Promise.resolve();
  },
}));

import { rename } from "node:fs/promises";

import {
  blogLockDir,
  withBlogRepoLock,
} from "../../../src/platforms/blog/lock.js";
import { exists } from "./steps-fixtures.js";

const realRename = await vi
  .importActual<typeof FsPromises>("node:fs/promises")
  .then((module) => module.rename);

let home = "";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "leafpress-lock-release-"));
  hoisted.delays.length = 0;
  vi.mocked(rename).mockClear();
  vi.mocked(rename).mockImplementation(realRename);
});

afterEach(async () => {
  vi.mocked(rename).mockImplementation(realRename);
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
});

function renameDenied(code = "EPERM"): Error {
  return Object.assign(new Error(`${code}: operation not permitted, rename`), {
    code,
  });
}

function lock<T>(
  run: () => Promise<T>,
  warn: (message: string) => void = () => undefined,
  workId = "b-1",
): Promise<T> {
  return withBlogRepoLock({
    home,
    accountId: "blog-1",
    workId,
    step: "导入文章",
    warn,
    run,
  });
}

describe("释放锁时改名被拒", () => {
  it("一直被拒：返回 run 的结果、记一条警告，锁文件夹留下；同一进程之后能再次拿到锁", async () => {
    const lockDir = blogLockDir(home, "blog-1");
    const warnings: string[] = [];
    vi.mocked(rename).mockRejectedValue(renameDenied());

    // 释放失败不盖掉 run 的结果
    await expect(
      lock(
        () => Promise.resolve("导入完成"),
        (message) => warnings.push(message),
      ),
    ).resolves.toBe("导入完成");

    // 最终失败记了警告，写明原因和下一步
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("博客仓库锁没有释放干净");
    expect(warnings[0]).toContain("EPERM");
    expect(warnings[0]).toContain("下次使用时会直接接管");
    // 锁文件夹还留在盘上，持有者写的是本进程
    expect(await exists(lockDir)).toBe(true);

    // 这正是原来的毛病：之后一小时都认不回自己的锁。现在本进程直接接管
    vi.mocked(rename).mockImplementation(realRename);
    await expect(
      lock(() => Promise.resolve("再次导入"), undefined, "b-2"),
    ).resolves.toBe("再次导入");
    expect(await exists(lockDir)).toBe(false);
    expect(warnings).toHaveLength(1);
  });

  it("run 抛错时释放也失败：抛出去的还是 run 的错，释放失败只记警告", async () => {
    const warnings: string[] = [];
    vi.mocked(rename).mockRejectedValue(renameDenied("EBUSY"));

    await expect(
      lock(
        () => Promise.reject(new Error("检查炸了")),
        (message) => warnings.push(message),
      ),
    ).rejects.toThrow("检查炸了");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("EBUSY");
  });

  it("重试放长到约 2 秒：每次退避着加长，合计约 2 秒后才放弃", async () => {
    vi.mocked(rename).mockRejectedValue(renameDenied());

    await lock(() => Promise.resolve(1));

    expect(hoisted.delays).toEqual([50, 100, 200, 400, 800, 450]);
    const total = hoisted.delays.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeGreaterThanOrEqual(1_900);
    expect(total).toBeLessThanOrEqual(2_600);
    // 7 次尝试：第一次加 6 次重试
    expect(vi.mocked(rename)).toHaveBeenCalledTimes(7);
  });

  it("前 6 次被拒、第 7 次放行：释放成功，没有警告（原来只试 5 次，这种情况会误锁一小时）", async () => {
    const warnings: string[] = [];
    let attempts = 0;
    vi.mocked(rename).mockImplementation((from, to) => {
      attempts += 1;
      return attempts <= 6
        ? Promise.reject(renameDenied())
        : realRename(from, to);
    });

    await lock(
      () => Promise.resolve(1),
      (message) => warnings.push(message),
    );

    expect(attempts).toBe(7);
    expect(warnings).toEqual([]);
    expect(await readdir(join(home, "locks"))).toEqual([]);
  });

  it("不是「被占住」类的错误（比如磁盘满）：不重试，直接记警告", async () => {
    const warnings: string[] = [];
    vi.mocked(rename).mockRejectedValue(renameDenied("ENOSPC"));

    await lock(
      () => Promise.resolve(1),
      (message) => warnings.push(message),
    );

    expect(hoisted.delays).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("没传 warn 时警告写到标准错误，带「注意：」前缀", async () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.mocked(rename).mockRejectedValue(renameDenied());

    await withBlogRepoLock({
      home,
      accountId: "blog-1",
      workId: "b-1",
      step: "导入文章",
      run: () => Promise.resolve(1),
    });

    const written = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(written).toContain("注意：博客仓库锁没有释放干净");
  });
});
