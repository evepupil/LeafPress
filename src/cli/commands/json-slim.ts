/**
 * 给 agent 看的 JSON 瘦身：共享规则算出来的结果里，账号带档案全文，作品带记录和反馈历史，
 * 概况、排行、周报的每一行都带一份，几个账号就超过 agent 工具 30K 字的输出上限。
 * 这里把账号收成 { id, name, platform }，作品收成 { id, title, url, publishedAt }，其余的数照旧。
 *
 * 没有对应日期观测的粉丝数写 null，不写 0；共享规则给出的逐日、逐周空值照实保留。
 */
import type {
  Account,
  AccountSummary,
  DayKey,
  MetricResult,
  PlatformId,
  RankedWork,
  WeekReport,
  WeekRow,
  WeeklyNote,
  Work,
} from "@leafpress/core";
import { PLATFORMS } from "@leafpress/core";
import { secondaryOf } from "@leafpress/core";

export interface SlimAccount {
  id: string;
  name: string;
  platform: PlatformId;
}

export interface SlimWork {
  id: string;
  title: string;
  url: string | null;
  publishedAt: DayKey | null;
}

export interface SlimRankedWork {
  work: SlimWork;
  account: SlimAccount;
  reach: number;
  interactions: number;
  growth: number;
  rate: number | null;
}

export interface SlimSummary {
  account: SlimAccount;
  /** 这个账号的第二个数是什么（知乎「互动」、博客「访客」），interactions7d 按这个含义读 */
  secondaryLabel: string;
  hasData: boolean;
  /** 记录库里真正有数的最后一天，窗口里没有记录为 null。比顶层 latestDay 早，说明最近几天没拉到，那几天的 0 是补出来的 */
  dataThrough: DayKey | null;
  /** 粉丝不可用或对应日期未观测时为 null */
  followers: number | null;
  followers7d: number | null;
  followers30d: number | null;
  reads7d: number;
  readsChange: number | null;
  interactions7d: number;
  postsThisWeek: number;
  works: number;
  lastPublishedAt: DayKey | null;
  daysSincePublish: number | null;
  weeklyGain: (number | null)[] | null;
  stale: boolean;
}

/**
 * 走势里的一个点，只留 agent 判断用得上的：标签、从哪天到哪天、本期和上一期的值。
 * 图上悬停提示用的 title（`10月5日 – 10月11日（到10月8日）`）和标签、起止日期重复，JSON 里不带。
 * 按天的点 start 和 end 相同；按周的点最后一周没过完时，end 是数据的最后一天。
 */
export interface SlimSeriesPoint {
  label: string;
  start: DayKey;
  end: DayKey;
  value: number | null;
  compare: number | null;
}

export interface SlimMetricResult extends Omit<MetricResult, "points"> {
  points: SlimSeriesPoint[];
}

/** 选中的账号都拿不到粉丝数时 followers 为 null，其余几项照旧 */
export interface SlimSeries {
  followers: SlimMetricResult | null;
  reads: SlimMetricResult;
  interactions: SlimMetricResult;
  posts: SlimMetricResult;
}

export interface SlimWeekRow {
  account: SlimAccount;
  hasData: boolean;
  followersStart: number | null;
  followersEnd: number | null;
  delta: number | null;
  posts: number;
  reads: number;
  interactions: number;
  best: { item: SlimRankedWork; weekReads: number } | null;
}

export interface SlimWeekReport {
  week: DayKey;
  end: DayKey;
  complete: boolean;
  rows: SlimWeekRow[];
  /** 至少一个账号周初、周末都有观测时才有 delta，否则为 null */
  totals: {
    delta: number | null;
    posts: number;
    reads: number;
    interactions: number;
  };
  readsChange: number | null;
  published: SlimRankedWork[];
  digest: string[];
  note: WeeklyNote | null;
}

export function slimAccount(account: Account): SlimAccount {
  return { id: account.id, name: account.name, platform: account.platform };
}

export function slimWork(work: Work): SlimWork {
  return {
    id: work.id,
    title: work.title,
    url: work.url ?? null,
    publishedAt: work.publishedAt ?? null,
  };
}

export function slimRanked(item: RankedWork): SlimRankedWork {
  return {
    work: slimWork(item.work),
    account: slimAccount(item.account),
    reach: item.reach,
    interactions: item.interactions,
    growth: item.growth,
    rate: item.rate,
  };
}

export function slimSummary(summary: AccountSummary): SlimSummary {
  const known = summary.followersKnown;
  return {
    account: slimAccount(summary.account),
    secondaryLabel: secondaryOf(PLATFORMS[summary.account.platform]).label,
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

function slimMetric(result: MetricResult): SlimMetricResult {
  return {
    ...result,
    points: result.points.map((point) => ({
      label: point.label,
      start: point.key,
      end: point.end,
      value: point.value,
      compare: point.compare,
    })),
  };
}

export function slimSeries(series: {
  followers: MetricResult;
  reads: MetricResult;
  interactions: MetricResult;
  posts: MetricResult;
}): SlimSeries {
  return {
    followers: series.followers.available ? slimMetric(series.followers) : null,
    reads: slimMetric(series.reads),
    interactions: slimMetric(series.interactions),
    posts: slimMetric(series.posts),
  };
}

function slimRow(row: WeekRow): SlimWeekRow {
  const known = row.followersKnown;
  return {
    account: slimAccount(row.account),
    hasData: row.hasData,
    followersStart: known ? row.followersStart : null,
    followersEnd: known ? row.followersEnd : null,
    delta: known ? row.delta : null,
    posts: row.posts,
    reads: row.reads,
    interactions: row.interactions,
    best:
      row.best === null
        ? null
        : { item: slimRanked(row.best.item), weekReads: row.best.weekReads },
  };
}

export function slimReport(report: WeekReport): SlimWeekReport {
  return {
    week: report.week,
    end: report.end,
    complete: report.complete,
    rows: report.rows.map(slimRow),
    totals: {
      delta: report.followersKnown ? report.totals.delta : null,
      posts: report.totals.posts,
      reads: report.totals.reads,
      interactions: report.totals.interactions,
    },
    readsChange: report.readsChange,
    published: report.published.map(slimRanked),
    digest: report.digest,
    note: report.note,
  };
}
