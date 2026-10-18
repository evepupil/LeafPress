import type {
  Account,
  MetricsDataset,
  PlatformId,
  UseCases,
  WeeklyNote,
  Work,
} from "@leafpress/core";
import { vi } from "vitest";

/**
 * data show 的假数据：今天 2026-10-08（周四），统计截至 10-07（周三）。
 * - zhihu-1：10-01 到 10-07 天天拉到，粉丝拿得到；
 * - blog-1：没拉到过数据，但 10-07 发过一篇文章（本周发布要算它）；
 * - blog-2：Umami 只给访问数、不给订阅数；10-04 之后三天没拉到，是补出来的 0。
 * 档案全文故意写得很长，用来确认 JSON 里不带它。
 */
export const TODAY = "2026-10-08";
export const LATEST_DAY = "2026-10-07";

const DAYS = ["01", "02", "03", "04", "05", "06", "07"];

export function makeAccount(
  id: string,
  platform: PlatformId,
  name: string,
): Account {
  return {
    id,
    platform,
    name,
    stage: "active",
    since: "2026-10-01",
    profile: "档案全文：写给谁、怎么写。".repeat(100),
    profilePath: `/tmp/${id}/profile.md`,
    settings: [],
    createdAt: "2026-10-01T00:00:00+08:00",
    updatedAt: "2026-10-01T00:00:00+08:00",
  };
}

export function makeWork(
  id: string,
  accountId: string,
  title: string,
  publishedAt: string,
  totals: Record<string, number>,
  url?: string,
): Work {
  return {
    id,
    title,
    accountId,
    status: "done",
    brief: "写作要求全文",
    source: { kind: "none" },
    workflowId: "general-write",
    step: 3,
    feedbackHistory: [
      {
        at: "2026-10-02T09:00:00+08:00",
        step: 1,
        stepName: "初稿",
        text: "反馈历史全文",
      },
    ],
    order: 1,
    createdAt: "2026-10-01T00:00:00+08:00",
    updatedAt: "2026-10-07T00:00:00+08:00",
    tags: [],
    log: [{ at: "2026-10-07T00:00:00+08:00", text: "作品记录" }],
    publishedAt,
    totals,
    ...(url === undefined ? {} : { url }),
  };
}

export const zhihu = makeAccount("zhihu-1", "zhihu", "一叶之桐");
export const quietBlog = makeAccount("blog-1", "blog", "技术博客");
export const umamiBlog = makeAccount("blog-2", "blog", "访问统计博客");

export const works: Work[] = [
  makeWork("w-first", zhihu.id, "第一篇作品", "2026-10-06", {
    views: 500,
    likes: 20,
  }),
  makeWork(
    "w-second",
    zhihu.id,
    "第二篇作品",
    "2026-10-07",
    { views: 700, likes: 10 },
    "https://zhuanlan.zhihu.com/p/2",
  ),
  makeWork("w-blog", quietBlog.id, "博客文章", "2026-10-07", {
    pageviews: 300,
    comments: 2,
  }),
];

export const dataset: MetricsDataset = {
  today: TODAY,
  latestDay: LATEST_DAY,
  daily: {
    [zhihu.id]: DAYS.map((day, index) => ({
      day: `2026-10-${day}`,
      followers: 90 + index * (index === 6 ? 2 : 1),
      reads: index + 3,
      interactions: index + 1,
      posts: index >= 5 ? 1 : 0,
    })),
    [umamiBlog.id]: DAYS.map((day, index) => ({
      day: `2026-10-${day}`,
      followers: null,
      reads: index < 4 ? 5 : 0,
      interactions: 0,
      posts: 0,
    })),
  },
  // 知乎号 10-01 到 10-07 天天有记录；Umami 博客只有 10-01 到 10-04 有记录，之后三天 daily 里是补出来的 0
  lastDays: { [zhihu.id]: "2026-10-07", [umamiBlog.id]: "2026-10-04" },
  workDays: {
    "w-first": [
      { day: "2026-10-06", reads: 8, interactions: 4 },
      { day: "2026-10-07", reads: 11, interactions: 5 },
    ],
    "w-second": [{ day: "2026-10-07", reads: 30, interactions: 2 }],
  },
};

/** 完全没拉到过数据的数据集 */
export const emptyDataset: MetricsDataset = {
  today: TODAY,
  latestDay: LATEST_DAY,
  daily: {},
  lastDays: {},
  workDays: {},
};

/**
 * 命令只用到 bootstrap 和 dataset 这两个用例，其余的不会被调用。
 * 把两个调用记录一起返回，测试要断言「读了几次」时直接用，不必从用例对象上取方法。
 */
export function spyUseCases(
  data: MetricsDataset = dataset,
  accounts: Account[] = [zhihu, quietBlog, umamiBlog],
  notes: WeeklyNote[] = [],
) {
  const bootstrap = vi.fn(() => ({ accounts, works, notes }));
  const readDataset = vi.fn(() => data);
  const useCases = {
    bootstrap,
    dataset: readDataset,
    gatherIdeas: vi.fn(() => Promise.resolve({ sources: [], pool: [] })),
    listCandidates: vi.fn(() => []),
    skipCandidates: vi.fn(() => []),
  } as unknown as UseCases;
  return { useCases, bootstrap, dataset: readDataset };
}

export function fakeUseCases(
  data: MetricsDataset = dataset,
  accounts: Account[] = [zhihu, quietBlog, umamiBlog],
  notes: WeeklyNote[] = [],
): UseCases {
  return spyUseCases(data, accounts, notes).useCases;
}
