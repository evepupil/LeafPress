import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { homePaths } from "../../src/config/home.js";
import { withTaskLock } from "../../src/files/lock.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function runWorker(home: string, counter: string): Promise<void> {
  const worker = fileURLToPath(
    new URL("./task-lock-worker.ts", import.meta.url),
  );
  const project = fileURLToPath(new URL("../../", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", import.meta.resolve("tsx"), worker, home, counter],
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
            `task lock worker failed: ${String(code)} ${String(signal)}`,
          ),
        );
    });
  });
}

function runStaleWorker(
  home: string,
  workId: string,
  counter: string,
  active: string,
): Promise<void> {
  const worker = fileURLToPath(
    new URL("./stale-task-lock-worker.ts", import.meta.url),
  );
  const project = fileURLToPath(new URL("../../", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        worker,
        home,
        workId,
        counter,
        active,
      ],
      { cwd: project, stdio: "ignore" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `stale-lock worker failed: ${String(code)} ${String(signal)}`,
          ),
        );
    });
  });
}

describe("任务文件夹目录锁", () => {
  it("两个真实子进程各加 20 次，临界区计数最终为 40", async () => {
    const home = await mkdtemp(join(tmpdir(), "leafpress-task-lock-"));
    dirs.push(home);
    const counter = join(home, "counter.txt");
    await writeFile(counter, "0", "utf8");
    await Promise.all([runWorker(home, counter), runWorker(home, counter)]);
    expect(await readFile(counter, "utf8")).toBe("40");
  }, 20_000);

  it("多个子进程同时回收 31 秒前的锁时，临界区每轮只有一个持有者", async () => {
    const home = await mkdtemp(join(tmpdir(), "leafpress-task-lock-reclaim-"));
    dirs.push(home);

    for (let round = 0; round < 4; round += 1) {
      const workId = `stale-${round}`;
      const folder = join(home, "tasks", workId);
      const lock = join(folder, ".lock");
      const counter = join(home, `counter-${round}.txt`);
      const active = join(home, `active-${round}.txt`);
      await mkdir(lock, { recursive: true });
      await writeFile(join(lock, "owner"), "expired-owner", "utf8");
      const old = new Date(Date.now() - 31_000);
      await utimes(lock, old, old);
      await writeFile(counter, "0", "utf8");

      await Promise.all(
        Array.from({ length: 4 }, () =>
          runStaleWorker(home, workId, counter, active),
        ),
      );

      expect(await readFile(counter, "utf8")).toBe("24");
      expect(existsSync(active)).toBe(false);
      expect(existsSync(lock)).toBe(false);
      expect(existsSync(`${lock}.reaper`)).toBe(false);
    }
  }, 45_000);

  it("超过 30 秒的锁目录会被清理", async () => {
    const home = await mkdtemp(join(tmpdir(), "leafpress-task-lock-stale-"));
    dirs.push(home);
    const folder = join(home, "tasks", "work-8");
    const lock = join(folder, ".lock");
    await mkdir(lock, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    expect(withTaskLock(homePaths(home), "work-8", () => "entered")).toBe(
      "entered",
    );
    expect(existsSync(lock)).toBe(false);
  });
});
