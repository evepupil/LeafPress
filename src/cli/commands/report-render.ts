import {
  PLATFORMS,
  formatCount,
  formatDay,
  formatSigned,
  formatWeekRange,
  metricText,
  type DayKey,
  type WeekReport,
} from "@leafpress/core";
import { renderTable, tableCell } from "../output.js";
import { primaryMetricLabel } from "./metric-label.js";
import type { ReportResult } from "./report.js";

/**
 * 分账号表。没数据的号，粉丝、浏览、互动写「—」；粉丝数拿不到的号（博客的 Umami 不给订阅数），
 * 粉丝和增减写「—」，浏览、互动照写。发布篇数不受影响：发了作品就算发布，不管有没有数据。
 */
function renderAccounts(report: WeekReport, metricLabel: string): string {
  return renderTable(
    ["账号", "粉丝", "增减", "发布", metricLabel, "互动"],
    report.rows.map((row) => {
      const followers = row.hasData && row.followersKnown;
      return [
        row.account.name,
        followers
          ? `${formatCount(row.followersStart)} → ${formatCount(row.followersEnd)}`
          : "—",
        followers ? formatSigned(row.delta) : "—",
        String(row.posts),
        row.hasData ? formatCount(row.reads) : "—",
        row.hasData ? formatCount(row.interactions) : "—",
      ];
    }),
  );
}

function renderPublished(
  report: WeekReport,
  today: DayKey,
  metricLabel: string,
): string {
  if (report.published.length === 0) return "没有作品";
  return renderTable(
    ["作品", "账号", "发布日期", metricLabel],
    report.published.map((item) => [
      tableCell(item.work.title, 40),
      item.account.name,
      item.work.publishedAt ? formatDay(item.work.publishedAt, today) : "—",
      metricText(
        item.work,
        item.account.platform,
        PLATFORMS[item.account.platform].metrics[0]?.key ?? "",
      ),
    ]),
  );
}

export function renderReport(result: ReportResult): string {
  const { report, today } = result;
  const metricLabel = primaryMetricLabel(report.rows.map((row) => row.account));
  // 本周还没过完时，标题里写明只统计到哪天
  const title = `${formatWeekRange(report.week)}周报${report.complete ? "" : `（到${formatDay(report.end, today)}）`}`;
  const lines = [
    title,
    "",
    "小结",
    ...report.digest,
    "",
    "分账号",
    renderAccounts(report, metricLabel),
    "",
    "这周发布",
    renderPublished(report, today, metricLabel),
  ];
  const note = report.note;
  if (note !== null) {
    const entries = [
      note.wins.trim() ? `做得好：${note.wins}` : undefined,
      note.improve.trim() ? `需要改进：${note.improve}` : undefined,
      note.next.trim() ? `下一步：${note.next}` : undefined,
    ].filter((entry): entry is string => entry !== undefined);
    if (entries.length > 0) lines.push("", "复盘", ...entries);
  }
  return lines.join("\n");
}
