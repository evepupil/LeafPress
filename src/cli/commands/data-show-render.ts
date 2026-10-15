import {
  PLATFORMS,
  addDays,
  combinedSecondary,
  formatCount,
  formatDay,
  formatSignedPercent,
  metricText,
  secondaryColumnLabel,
  type AccountSummary,
  type DayKey,
  type MetricResult,
} from "@leafpress/core";
import { renderTable, tableCell } from "../output.js";
import type { DataShowFull, DataShowResult } from "./data-show.js";
import { primaryMetricLabel } from "./metric-label.js";

const NO_DATA_ALL = "还没有数据：拿数据的工具接上并拉过一次之后才有";
const NO_DATA_ONE = "这个账号还没有数据";

/** 选中的账号的平台，取名用（第二个数是互动还是访客，见 secondary.ts） */
function platformsOf(summaries: readonly AccountSummary[]) {
  return summaries.map((summary) => PLATFORMS[summary.account.platform]);
}

/**
 * 概况表的一行。没数据的号，数字列写「—」：补出来的 0 不是真的 0。
 * 本周发布不受影响：发了作品就算发布，不管有没有数据，和网页一致。
 * 粉丝无当前观测时写「—」，不写 0；增减若缺少比较区间也写「—」。
 */
function summaryRow(summary: AccountSummary, today: DayKey): string[] {
  const { hasData } = summary;
  return [
    summary.account.name,
    summary.followers === null ? "—" : formatCount(summary.followers),
    hasData ? formatCount(summary.reads7d) : "—",
    hasData ? formatSignedPercent(summary.readsChange) : "—",
    hasData ? formatCount(summary.interactions7d) : "—",
    String(summary.postsThisWeek),
    summary.lastPublishedAt ? formatDay(summary.lastPublishedAt, today) : "—",
    summary.dataThrough ? formatDay(summary.dataThrough, today) : "—",
  ];
}

/** 12 周走势的最后一周还没过完：这一周的周日比数据的最后一天晚（4 周按天画，没有这个问题） */
function lastWeekIsPartial(result: DataShowFull): boolean {
  if (result.range !== "12w") return false;
  const last = result.series.reads.points.at(-1);
  return last !== undefined && addDays(last.key, 6) > result.latestDay;
}

function renderSeries(
  result: DataShowFull,
  metricLabel: string,
  secondaryLabel: string,
): string[] {
  const { followers, reads, interactions, posts } = result.series;
  const partial = lastWeekIsPartial(result);
  const lastIndex = reads.points.length - 1;
  const valueAt = (metric: MetricResult, index: number): string => {
    const value = metric.points[index]?.value;
    return value === null || value === undefined ? "—" : formatCount(value);
  };
  return reads.points.map((point, index) => {
    // 没过完的那一周只统计到数据的最后一天，不标出来会像是这一周掉下去了
    const label =
      partial && index === lastIndex
        ? `${point.label}（到${formatDay(result.latestDay, result.today)}）`
        : point.label;
    // 没有对应日期的粉丝观测时写「—」
    const followersText = followers.available ? valueAt(followers, index) : "—";
    // 第二个数按选中的平台取名：全是博客叫「访客」，混着叫「互动」（共享规则合计时只加互动类）
    return `${label}  粉丝 ${followersText}  ${metricLabel} ${valueAt(reads, index)}  ${secondaryLabel} ${valueAt(interactions, index)}  发布 ${valueAt(posts, index)}`;
  });
}

function renderTop(
  result: DataShowFull,
  metricLabel: string,
  secondaryLabel: string,
): string {
  if (result.top.length === 0) return "没有可排行的作品";
  return renderTable(
    ["#", "作品", "账号", metricLabel, secondaryLabel, "近 7 天"],
    result.top.map((item, index) => [
      String(index + 1),
      tableCell(item.work.title, 40),
      item.account.name,
      metricText(
        item.work,
        item.account.platform,
        PLATFORMS[item.account.platform].metrics[0]?.key ?? "",
      ),
      formatCount(item.interactions),
      item.growth > 0 ? `+${formatCount(item.growth)}` : "—",
    ]),
  );
}

export function renderDataShow(result: DataShowResult): string {
  // 选中的账号没有数：只说一句，不输出补零的走势和空的排行
  if (!result.hasData) return result.scoped ? NO_DATA_ONE : NO_DATA_ALL;

  const metricLabel = primaryMetricLabel(
    result.summaries.map((summary) => summary.account),
  );
  // 第二个数的取名：概况和排行走列名的规则（知乎互动、博客访客，混着写「互动 / 访客」），
  // 走势走合计的规则（共享规则合计时只加互动类账号，名字跟着合计的口径走）
  const secondaryColumn = secondaryColumnLabel(platformsOf(result.summaries));
  const seriesLabel = combinedSecondary(platformsOf(result.summaries)).label;
  return [
    `截至 ${formatDay(result.latestDay, result.today)}`,
    renderTable(
      [
        "账号",
        "粉丝",
        `近 7 天${metricLabel}`,
        "比上 7 天",
        `近 7 天${secondaryColumn}`,
        "本周发布",
        "上次发布",
        "数据到",
      ],
      result.summaries.map((summary) => summaryRow(summary, result.today)),
    ),
    "",
    "走势",
    ...renderSeries(result, metricLabel, seriesLabel),
    "",
    "作品排行",
    renderTop(result, metricLabel, secondaryColumn),
  ].join("\n");
}
