/**
 * 作品的累计访问快照：截止昨天的累计查一次（全部路径一次取完），
 * 起点后一天到昨天每天各查一次当天，倒推出每天结束时的累计（公式见 cumulative.ts）。
 * 链接是本站中文文章地址、但 Umami 里查不到访问的作品，只给昨天记一条访问 0、访客 0 的快照：
 * 这样它有了累计数据，下次拉取不会再因为它退回补历史。
 * 任何一步失败都抛错，由上层整次失败，不返回半截数据。
 */
import { addDays, diffDays } from "@leafpress/core";
import type { DayKey, Work } from "@leafpress/core";

import type { DataPullResult } from "../../types.js";
import type { UmamiClient } from "./client.js";
import { cumulativeSeries, snapshotsOf } from "./cumulative.js";
import {
  countByArticlePath,
  siteTotalPageviews,
  type SiteRule,
} from "./paths.js";
import { dayRangeInTimezone } from "./time.js";

/** 查「截止昨天的累计」的起点：比任何站点都早，等于从有数据起 */
const LIFETIME_START_DAY = "2000-01-01";
/** 补历史时每隔几天报一次进度 */
const PROGRESS_EVERY_DAYS = 10;

export type WorkSnapshotRecord = DataPullResult["works"][number];

export interface WorkSnapshotsInput {
  client: UmamiClient;
  site: SiteRule;
  /** 对得上本站文章的作品，按文章路径分组 */
  tracked: ReadonlyMap<string, readonly Work[]>;
  start: DayKey;
  yesterday: DayKey;
  /** 起点到昨天全站的访问合计（日序列加起来），用来确认起点之前有没有访问 */
  windowPageviews: number;
  /** 补历史：每 10 天报一次进度 */
  progress?: ((message: string) => void) | undefined;
}

export interface WorkSnapshotsResult {
  snapshots: WorkSnapshotRecord[];
  /** 写了快照的作品数（含只记了一条 0 的） */
  written: number;
  /** 昨天的累计比记录库里现有的还小，这次没写的作品编号 */
  shrunk: string[];
}

/**
 * 昨天的累计比作品记录里的累计小：Umami 免费版只保留 6 个月，旧数据被清掉了，
 * 或者文章地址改过、新地址上还没有访问。不能拿小的盖掉大的
 */
function isShrunk(work: Work, total: number): boolean {
  const recorded = work.totals?.["pageviews"];
  return recorded !== undefined && total < recorded;
}

export async function readWorkSnapshots(
  input: WorkSnapshotsInput,
): Promise<WorkSnapshotsResult> {
  const { client, site, tracked, start, yesterday } = input;

  const lifetimeRows = await client.expandedPaths(
    dayRangeInTimezone(LIFETIME_START_DAY).startAt,
    dayRangeInTimezone(yesterday).endAt,
  );
  const lifetime = countByArticlePath(lifetimeRows, site);
  // 全站累计和起点以来的访问合计一样，说明起点之前全站没有访问
  const noVisitsBeforeStart =
    siteTotalPageviews(lifetimeRows) === input.windowPageviews;

  const shrunk: string[] = [];
  const pending: { path: string; works: Work[]; total: number }[] = [];
  /** 查不到访问的作品 */
  const unvisited: Work[] = [];
  for (const [path, works] of tracked) {
    const total = lifetime.get(path)?.pageviews ?? 0;
    const writable = works.filter((work) => {
      if (!isShrunk(work, total)) return true;
      shrunk.push(work.id);
      return false;
    });
    if (writable.length === 0) continue;
    if (total > 0) pending.push({ path, works: writable, total });
    else unvisited.push(...writable);
  }

  // 每个要写的路径在每一天的访问；累计为 0 的路径往前也全是 0，不用查
  const dailyByPath = new Map<string, Map<DayKey, number>>(
    pending.map((item) => [item.path, new Map()]),
  );
  if (pending.length > 0 && diffDays(yesterday, start) > 0) {
    const totalDays = diffDays(yesterday, start) + 1;
    let daysDone = 1;
    for (
      let day = yesterday;
      diffDays(day, start) > 0;
      day = addDays(day, -1)
    ) {
      const range = dayRangeInTimezone(day);
      const counts = countByArticlePath(
        await client.expandedPaths(range.startAt, range.endAt),
        site,
      );
      for (const [path, byDay] of dailyByPath)
        byDay.set(day, counts.get(path)?.pageviews ?? 0);
      daysDone += 1;
      if (daysDone % PROGRESS_EVERY_DAYS === 0)
        input.progress?.(`补历史：第 ${daysDone}/${totalDays} 天`);
    }
  }

  const snapshots: WorkSnapshotRecord[] = [];
  const written = new Set<string>();
  for (const { path, works, total } of pending) {
    const points = cumulativeSeries({
      start,
      yesterday,
      total,
      daily: (day) => dailyByPath.get(path)?.get(day) ?? 0,
    });
    const visitors = lifetime.get(path)?.visitors ?? 0;
    for (const work of works) {
      // 第一次入库的作品，确认起点之前没有访问，起点当天的访问才算当天的新增
      const zeroBeforeStart = !work.totalsDay && noVisitsBeforeStart;
      for (const snapshot of snapshotsOf(points, visitors, zeroBeforeStart)) {
        snapshots.push({ workId: work.id, ...snapshot });
        written.add(work.id);
      }
    }
  }
  // 没有访问的作品：昨天记一条全 0，往前不用查（累计是 0，往前也全是 0）
  for (const work of unvisited) {
    snapshots.push({
      workId: work.id,
      day: yesterday,
      totals: { pageviews: 0, visitors: 0 },
    });
    written.add(work.id);
  }
  return { snapshots, written: written.size, shrunk };
}
