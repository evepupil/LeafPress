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
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  blogLockDir,
  withBlogRepoLock,
} from "../../../src/platforms/blog/lock.js";
import { PROCESS_INSTANCE } from "../../../src/platforms/blog/lock-owner.js";
import { exists } from "./steps-fixtures.js";

let home = "";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "leafpress-lock-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function acquire<T>(
  run: () => Promise<T>,
  overrides: { accountId?: string; workId?: string; step?: string } = {},
): Promise<T> {
  return withBlogRepoLock({
    home,
    accountId: overrides.accountId ?? "blog-1",
    workId: overrides.workId ?? "b-1",
    step: overrides.step ?? "跑博客检查",
    run,
  });
}

/** 造一个肯定已经退出的进程号 */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  const pid = child.pid;
  if (pid === undefined) throw new Error("起不了子进程");
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
  return pid;
}

/** 起一个一直活着的别的进程，返回它的进程号和停掉它的办法 */
function liveProcess(): { pid: number; stop(): void } {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  if (child.pid === undefined) throw new Error("起不了子进程");
  return { pid: child.pid, stop: () => child.kill() };
}

async function plantOwner(
  owner: Partial<{
    pid: number;
    instance: string;
    startedAt: string;
    step: string;
    workId: string;
  }>,
): Promise<string> {
  const dir = blogLockDir(home, "blog-1");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "owner.json"),
    JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      step: "导入文章",
      workId: "b-9",
      ...owner,
    }),
    "utf8",
  );
  return dir;
}

describe("博客仓库锁", () => {
  it("锁放在数据目录 locks/blog-<账号编号>/，里面记着持有者；跑完释放", async () => {
    const dir = blogLockDir(home, "blog-1");
    expect(dir).toBe(join(home, "locks", "blog-blog-1"));

    const owner = await acquire(async () => {
      expect(await exists(dir)).toBe(true);
      return JSON.parse(await readFile(join(dir, "owner.json"), "utf8")) as {
        pid: number;
        startedAt: string;
        step: string;
        workId: string;
      };
    });

    expect(owner.pid).toBe(process.pid);
    expect(owner.step).toBe("跑博客检查");
    expect(owner.workId).toBe("b-1");
    expect(Number.isFinite(Date.parse(owner.startedAt))).toBe(true);
    expect(await exists(dir)).toBe(false);
    expect(await readdir(join(home, "locks"))).toEqual([]);
  });

  it("run 抛错也会释放，并把原错误抛出去", async () => {
    await expect(
      acquire(() => Promise.reject(new Error("检查炸了"))),
    ).rejects.toThrow("检查炸了");

    expect(await exists(blogLockDir(home, "blog-1"))).toBe(false);
    await expect(acquire(() => Promise.resolve("又能拿了"))).resolves.toBe(
      "又能拿了",
    );
  });

  it("被活着的进程占着：立即失败，说清是哪一步、哪个作品、几点开始", async () => {
    await acquire(async () => {
      const started = Date.now();
      const error: unknown = await acquire(() => Promise.resolve("不该跑到"), {
        step: "提交并推送",
        workId: "b-2",
      }).catch((caught: unknown) => caught);

      expect(Date.now() - started).toBeLessThan(2_000);
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toMatch(
        /^博客仓库正在被另一次「跑博客检查」使用（作品 b-1，\d{2}:\d{2} 开始），等它跑完再试$/,
      );
    });
  });

  it("不同账号的锁互不影响", async () => {
    await acquire(async () => {
      await expect(
        acquire(() => Promise.resolve("拿到了"), { accountId: "blog-2" }),
      ).resolves.toBe("拿到了");
    });
  });

  it("持有者进程已经退出：当作上次异常退出留下的，接管", async () => {
    const dir = await plantOwner({ pid: await deadPid() });

    const result = await acquire(() => Promise.resolve("接管成功"));

    expect(result).toBe("接管成功");
    expect(await exists(dir)).toBe(false);
    expect(await readdir(join(home, "locks"))).toEqual([]);
  });

  it("持有者进程还在，但开始已超过 60 分钟：当作过期，接管", async () => {
    await plantOwner({
      startedAt: new Date(Date.now() - 61 * 60_000).toISOString(),
    });

    await expect(acquire(() => Promise.resolve("接管成功"))).resolves.toBe(
      "接管成功",
    );
  });

  it("锁文件夹里没有持有者信息（建到一半崩了）：放够一会儿后接管", async () => {
    const dir = blogLockDir(home, "blog-1");
    await mkdir(dir, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    await utimes(dir, old, old);

    await expect(acquire(() => Promise.resolve("接管成功"))).resolves.toBe(
      "接管成功",
    );
  });

  it("持有者信息损坏：同样按没有信息处理", async () => {
    const dir = blogLockDir(home, "blog-1");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "owner.json"), "{坏了", "utf8");
    const old = new Date(Date.now() - 60_000);
    await utimes(dir, old, old);

    await expect(acquire(() => Promise.resolve("接管成功"))).resolves.toBe(
      "接管成功",
    );
  });

  it("留下的「.reaper」短锁过了 30 秒没人管：清掉再接管", async () => {
    const dir = await plantOwner({ pid: await deadPid() });
    const reaper = `${dir}.reaper`;
    await mkdir(reaper);
    const old = new Date(Date.now() - 60_000);
    await utimes(reaper, old, old);

    await expect(acquire(() => Promise.resolve("接管成功"))).resolves.toBe(
      "接管成功",
    );
    expect(await exists(reaper)).toBe(false);
  });

  it("释放时锁已经被别人接管：不删别人的锁", async () => {
    const dir = blogLockDir(home, "blog-1");

    await acquire(async () => {
      // 模拟本次跑太久被别的进程接管：锁文件夹里换成了别人的持有者信息
      await writeFile(
        join(dir, "owner.json"),
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          step: "导入文章",
          workId: "b-7",
        }),
        "utf8",
      );
    });

    expect(await exists(dir)).toBe(true);
    expect(
      (
        JSON.parse(await readFile(join(dir, "owner.json"), "utf8")) as {
          workId: string;
        }
      ).workId,
    ).toBe("b-7");
  });

  it("别的进程（真的活着）拿着锁：被拒，就算它的锁看上去再新", async () => {
    const other = liveProcess();
    try {
      const dir = await plantOwner({
        pid: other.pid,
        instance: "另一个进程的运行标记",
      });

      const error: unknown = await acquire(() =>
        Promise.resolve("不该跑到"),
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /^博客仓库正在被另一次「导入文章」使用（作品 b-9，\d{2}:\d{2} 开始），等它跑完再试$/,
      );
      // 它的锁原样留着
      expect(await exists(dir)).toBe(true);
    } finally {
      other.stop();
    }
  });

  it("本进程上次没释放干净的锁（锁里是本进程的进程号和运行标记，进程内的表里却没有）：直接接管", async () => {
    // 这就是释放失败（改名被拒）后留下的样子
    const dir = await plantOwner({
      pid: process.pid,
      instance: PROCESS_INSTANCE,
      startedAt: new Date().toISOString(),
      step: "导入文章",
      workId: "b-9",
    });

    const result = await acquire(() => Promise.resolve("接管成功"));

    expect(result).toBe("接管成功");
    expect(await exists(dir)).toBe(false);
  });

  it.each([
    ["进程号被复用过（运行标记对不上）", "前一个同号进程的运行标记"],
    ["旧版本写的锁（没有运行标记）", undefined],
  ])(
    "锁里是本进程的进程号，但%s：不当作自己的，按进程还活着处理，被拒",
    async (_name, instance) => {
      await plantOwner({
        pid: process.pid,
        ...(instance === undefined ? {} : { instance }),
      });

      await expect(acquire(() => Promise.resolve("不该跑到"))).rejects.toThrow(
        /正在被另一次「导入文章」使用/,
      );
    },
  );

  it("账号编号不安全时拒绝", async () => {
    await expect(
      acquire(() => Promise.resolve(1), { accountId: "../x" }),
    ).rejects.toThrow();
  });
});
