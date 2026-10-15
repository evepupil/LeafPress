import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addDays,
  reportWeeks,
  toIsoTime,
  type Account,
  type DayKey,
  type Work,
} from "@leafpress/core";
import { expect } from "vitest";
import { homePaths } from "../../src/config/home.js";
import { openStore } from "../../src/store/open.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(repoRoot, "dist", "cli", "main.js");

export function runCli(home: string, args: readonly string[]) {
  return spawnSync(process.execPath, [cli, "--home", home, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
    env: process.env,
  });
}

/** 运行命令并要求退出码为 0，返回标准输出 */
export function invoke(home: string, args: readonly string[]): string {
  const result = runCli(home, args);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout;
}

export function addAccount(
  home: string,
  platform: string,
  name: string,
  intro = "",
): Account {
  const args = [
    "--json",
    "account",
    "add",
    "--platform",
    platform,
    "--name",
    name,
  ];
  if (intro !== "") args.push("--intro", intro);
  return (JSON.parse(invoke(home, args)) as { account: Account }).account;
}

/** 直接往记录库写一个已发布的作品（不走命令行，免得每个作品开一次进程） */
export function makeDoneWork(
  id: string,
  accountId: string,
  title: string,
  publishedAt: DayKey,
  totals?: Record<string, number>,
): Work {
  return {
    id,
    title,
    accountId,
    status: "done",
    brief: "写作要求全文",
    source: { kind: "none" },
    workflowId: "general-write",
    step: 4,
    feedbackHistory: [],
    order: 1,
    createdAt: "2026-10-01T00:00:00+08:00",
    updatedAt: "2026-10-01T00:00:00+08:00",
    tags: [],
    log: [{ at: "2026-10-01T00:00:00+08:00", text: "作品记录" }],
    publishedAt,
    ...(totals === undefined ? {} : { totals }),
    url: `https://example.com/${id}`,
  };
}

export function withStore<T>(
  home: string,
  action: (store: ReturnType<typeof openStore>) => T,
): T {
  const store = openStore(homePaths(home).dbFile);
  try {
    return action(store);
  } finally {
    store.close();
  }
}

/**
 * 场景一：两个账号，知乎号有数据，博客号没有。
 * - 知乎号 today-4 到 today-2 三天拉到数据（昨天没拉到，数据集会补一天 0），发过一篇作品；
 * - 博客号从没拉到过数据，但发过两篇：一篇 today-3 的旧文章（后加进来但有旧作品），一篇今天发的。
 * 账号都是今天才加的（since 是今天），周报分账号表得靠「有数据 / 发过作品」才列得出它们。
 */
export function setupTwoAccounts(home: string, today: DayKey) {
  expect(invoke(home, ["init"])).toContain("数据目录：");
  const zhihu = addAccount(home, "zhihu", "集成账号");
  const blog = addAccount(home, "blog", "无数据博客");
  invoke(home, [
    "--json",
    "work",
    "new",
    "--account",
    zhihu.id,
    "--title",
    "集成测试作品",
  ]);
  withStore(home, (store) => {
    const work = store.works.list().find((item) => item.accountId === zhihu.id);
    if (work === undefined) throw new Error("缺少知乎作品");
    store.works.update({
      ...work,
      status: "done",
      step: 4,
      publishedAt: addDays(today, -3),
    });
    [-4, -3, -2].forEach((offset, index) => {
      const day = addDays(today, offset);
      store.snapshots.putAccountDay({
        accountId: zhihu.id,
        day,
        followers: 100 + index * 5,
        reads: 20 + index * 10,
        interactions: 2 + index,
      });
      store.snapshots.putWorkSnapshot({
        workId: work.id,
        day,
        totals: { views: 50 + index * 25, likes: 2 + index },
      });
    });
    store.works.insert(
      makeDoneWork("b-101", blog.id, "旧文章", addDays(today, -3)),
    );
    store.works.insert(makeDoneWork("b-102", blog.id, "今天的文章", today));
    const week = reportWeeks(today)[0];
    if (week === undefined) throw new Error("No report week available");
    store.notes.save({
      week,
      wins: "完成发布",
      improve: "完善标题",
      next: "继续观察数据",
      updatedAt: toIsoTime(new Date()),
    });
  });
  return { zhihu, blog };
}

/**
 * 场景二：3 个账号，每个档案 1000 字以上，12 个作品都有累计数据（排行排满 10 个）、
 * 都是昨天发的（周报那一周的「这周发布」也有 12 个）。用来量命令输出有多长。
 */
export function setupLargeAccounts(home: string, today: DayKey): Account[] {
  expect(invoke(home, ["init"])).toContain("数据目录：");
  const intro = "写给谁、怎么写的档案全文。".repeat(100);
  const accounts = [
    addAccount(home, "zhihu", "知乎大号", intro),
    addAccount(home, "bilibili", "B站大号", intro),
    addAccount(home, "xiaohongshu", "小红书大号", intro),
  ];
  withStore(home, (store) => {
    accounts.forEach((account, accountIndex) => {
      [-4, -3, -2].forEach((offset, index) => {
        store.snapshots.putAccountDay({
          accountId: account.id,
          day: addDays(today, offset),
          followers: 1000 + accountIndex * 100 + index * 5,
          reads: 200 + index * 10,
          interactions: 20 + index,
        });
      });
      for (let n = 0; n < 4; n += 1) {
        const serial = accountIndex * 4 + n + 1;
        store.works.insert(
          makeDoneWork(
            `w-${200 + serial}`,
            account.id,
            `第 ${serial} 篇：一个差不多三十个字的作品标题用来凑长度`,
            addDays(today, -1),
            { views: 1000 + serial * 10, likes: 10 + serial },
          ),
        );
      }
    });
  });
  return accounts;
}
