import {
  accountSummary,
  metricSeries,
  reportWeeks,
  topWorks,
  weekReport,
  type Account,
  type AccountSummary,
  type DayKey,
  type MetricResult,
  type RankedWork,
} from "@leafpress/core";
import { createCliContext } from "../../src/cli/context.js";

/** 契约的另一份手写：账号只带这三项，作品只带这四项（不用命令行自己的瘦身函数，免得测试跟着出错） */
export function slimAccount(account: Account) {
  return { id: account.id, name: account.name, platform: account.platform };
}

export function slimRanked(item: RankedWork) {
  return {
    work: {
      id: item.work.id,
      title: item.work.title,
      url: item.work.url ?? null,
      publishedAt: item.work.publishedAt ?? null,
    },
    account: slimAccount(item.account),
    reach: item.reach,
    interactions: item.interactions,
    growth: item.growth,
    rate: item.rate,
  };
}

export function slimSummary(summary: AccountSummary) {
  const known = summary.followersKnown;
  return {
    account: slimAccount(summary.account),
    hasData: summary.hasData,
    dataThrough: summary.dataThrough,
    followers: known ? summary.followers : null,
    followers7d: known ? summary.followers7d : null,
    followers30d: known ? summary.followers30d : null,
    reads7d: summary.reads7d,
    readsChange: summary.readsChange,
    interactions7d: summary.interactions7d,
    postsThisWeek: summary.postsThisWeek,
    works: summary.works,
    lastPublishedAt: summary.lastPublishedAt,
    daysSincePublish: summary.daysSincePublish,
    weeklyGain: known ? summary.weeklyGain : null,
    stale: summary.stale,
  };
}

/** 走势：每个点只留标签、起止日期和两个值（不用命令行自己的瘦身函数） */
export function slimMetric(result: MetricResult) {
  return {
    metric: result.metric,
    available: result.available,
    value: result.value,
    change: result.change,
    points: result.points.map((point) => ({
      label: point.label,
      start: point.key,
      end: point.end,
      value: point.value,
      compare: point.compare,
    })),
  };
}

export function slimSeries(
  series: Record<
    "followers" | "reads" | "interactions" | "posts",
    MetricResult
  >,
) {
  return {
    followers: series.followers.available ? slimMetric(series.followers) : null,
    reads: slimMetric(series.reads),
    interactions: slimMetric(series.interactions),
    posts: slimMetric(series.posts),
  };
}

/** 命令行 --json 输出里测试要看的部分（JSON.parse 出来是 any，这里给它一个形状） */
export interface ShownData {
  ok: boolean;
  today: DayKey;
  latestDay: DayKey;
  hasData: boolean;
  summaries: ReturnType<typeof slimSummary>[];
  series?: Record<
    string,
    { available: boolean; points: Record<string, unknown>[] } | null
  >;
  top?: ReturnType<typeof slimRanked>[];
}

export interface ShownReport {
  ok: boolean;
  report: {
    week: DayKey;
    digest: string[];
    note: unknown;
    rows: {
      account: { id: string; name: string; platform: string };
      hasData: boolean;
      followersStart: number | null;
      followersEnd: number | null;
      delta: number | null;
    }[];
    totals: { delta: number | null };
    published: { work: { id: string } }[];
  };
}

export function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

/** 直接调共享规则算期望值：命令行的数必须和网页用的同一套算法一致 */
export async function sharedExpectations(
  home: string,
  tempHome: string,
  options: { accountId?: string } = {},
) {
  const context = createCliContext(
    { home },
    { homedir: tempHome, env: process.env },
  );
  try {
    const usecases = await context.getUseCases();
    const bootstrap = usecases.bootstrap();
    const dataset = usecases.dataset();
    const input = {
      dataset,
      accounts: bootstrap.accounts,
      works: bootstrap.works,
    };
    const scope = options.accountId ?? "all";
    const week = reportWeeks(dataset.today)[0];
    if (week === undefined) throw new Error("No report week available");
    return {
      today: dataset.today,
      latestDay: dataset.latestDay,
      accounts: bootstrap.accounts,
      summaries: bootstrap.accounts.map((account) =>
        accountSummary(input, account),
      ),
      series: {
        followers: metricSeries(input, scope, "followers", "12w"),
        reads: metricSeries(input, scope, "reads", "12w"),
        interactions: metricSeries(input, scope, "interactions", "12w"),
        posts: metricSeries(input, scope, "posts", "12w"),
      },
      top: topWorks(input, "reach", 10, options.accountId),
      report: weekReport({ ...input, notes: bootstrap.notes }, week),
    };
  } finally {
    await context.close();
  }
}
