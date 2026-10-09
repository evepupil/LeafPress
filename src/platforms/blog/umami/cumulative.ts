/**
 * 作品每天的累计访问：只查一次「截止昨天的累计」，往前每天只查当天，用减法倒推。
 *
 *   累计(d) = 累计(昨天) − Σ 当天访问(d+1 … 昨天)
 *
 * 例：10/8 累计 100，10/8 当天 5、10/7 当天 3，则 10/7 结束时累计 95，10/6 结束时累计 92。
 * 所以单日请求的日期是「起点后一天到昨天」，起点那天自己的单日数用不上。
 * 访客数不能逐日相加，只有昨天那条快照带访客。
 */
import { addDays, diffDays } from "@leafpress/core";
import type { DayKey, WorkTotals } from "@leafpress/core";

import { UmamiInconsistentError } from "./errors.js";

export interface CumulativePoint {
  day: DayKey;
  /** 那天结束时的累计访问 */
  pageviews: number;
}

export interface DaySnapshot {
  day: DayKey;
  totals: WorkTotals;
}

/**
 * 算出起点到昨天每一天结束时的累计（按日期升序）。
 * daily(day) 是那天一天的访问，只会被问到「起点后一天到昨天」。
 * 累计是负数、或者按日期下降，说明拿到的数前后对不上，抛 UmamiInconsistentError。
 */
export function cumulativeSeries(input: {
  start: DayKey;
  yesterday: DayKey;
  /** 截止昨天的累计访问 */
  total: number;
  daily: (day: DayKey) => number;
}): CumulativePoint[] {
  const { start, yesterday, total, daily } = input;
  if (!Number.isFinite(total) || total < 0) throw new UmamiInconsistentError();

  const points: CumulativePoint[] = [{ day: yesterday, pageviews: total }];
  let cumulative = total;
  for (let day = yesterday; diffDays(day, start) > 0; day = addDays(day, -1)) {
    const visits = daily(day);
    if (!Number.isFinite(visits)) throw new UmamiInconsistentError();
    cumulative -= visits;
    if (cumulative < 0) throw new UmamiInconsistentError();
    points.push({ day: addDays(day, -1), pageviews: cumulative });
  }
  points.reverse();

  // 当天访问是负数时，往前倒推的累计会变大，也就是按日期下降
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    if (before && after && after.pageviews < before.pageviews)
      throw new UmamiInconsistentError();
  }
  return points;
}

/**
 * 累计变成要入库的快照：
 * - 累计为 0 的天不写；
 * - 第一次出现非零累计的前一天写一条全 0 快照，让第一天的访问算进当天的新增
 *   （共享规则把每篇的第一条快照当起点）；
 * - 只有昨天那条带访客，其余天只有访问。
 *
 * 第一次非零正好是起点那天时，前一天在这次查的范围之外，累计不知道是不是 0：
 * 只有 zeroBeforeStart 为真（确认起点之前这篇没有访问）才补那条全 0 快照，
 * 否则不写，免得把起点之前攒下的访问全算成起点那天的新增。
 */
export function snapshotsOf(
  points: readonly CumulativePoint[],
  visitors: number,
  zeroBeforeStart: boolean,
): DaySnapshot[] {
  const firstIndex = points.findIndex((point) => point.pageviews > 0);
  const first = points[firstIndex];
  if (first === undefined) return [];

  const snapshots: DaySnapshot[] = [];
  if (firstIndex > 0 || zeroBeforeStart) {
    snapshots.push({
      day: addDays(first.day, -1),
      totals: { pageviews: 0, visitors: 0 },
    });
  }
  const lastIndex = points.length - 1;
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const point = points[index];
    if (point === undefined) continue;
    snapshots.push({
      day: point.day,
      totals:
        index === lastIndex
          ? { pageviews: point.pageviews, visitors }
          : { pageviews: point.pageviews },
    });
  }
  return snapshots;
}
