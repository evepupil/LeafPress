/**
 * 补历史：把带日期的每天一段数，往回减出每天的收盘累计（照 umami/cumulative.ts 的算法）。
 *
 *   累计(d) = 累计(昨天) − Σ 当天(d+1 … 昨天)
 *
 * 例：10/8 累计 100，10/8 当天 5、10/7 当天 3，则 10/7 结束时累计 95，10/6 结束时累计 92。
 * 减出负数、或按日期下降（当天数是负的，往回看累计反而变多），说明拿到的数前后对不上，
 * 抛 ZhihuInconsistentError，调用方据此整次失败不入库。
 * 某天没数据的指标当作当天没增长（累计不变）。
 */
import { addDays } from "@leafpress/core";
import type { DayKey, WorkTotals } from "@leafpress/core";

import type { ContentStatsDay, ZhihuMetricKey } from "./content-stats.js";
import { ZhihuInconsistentError } from "./errors.js";

export interface BackfillInput {
  workId: string;
  /** 补到哪天为止（含这天）；没有发布日可参照时用响应里最早的一天 */
  start: DayKey;
  yesterday: DayKey;
  /** 截止昨天的累计 */
  yesterdayTotal: WorkTotals;
  /** 带起止日期请求回的每天一段数 */
  series: readonly ContentStatsDay[];
}

/** 每天的收盘累计（按日期升序），昨天那条也在里面 */
export function backfillRows(input: BackfillInput): {
  day: DayKey;
  totals: WorkTotals;
}[] {
  const { start, yesterday, yesterdayTotal } = input;
  const daily = new Map(input.series.map((point) => [point.day, point.totals]));
  // 从昨天往回逐天减，减到起点那天为止（含起点；起点前一天的累计不知道，不写）
  const rows: { day: DayKey; totals: WorkTotals }[] = [
    { day: yesterday, totals: yesterdayTotal },
  ];
  for (let day = yesterday; day > start; day = addDays(day, -1)) {
    const current = rows[0];
    if (current === undefined) break;
    const thatDay = daily.get(day);
    const nextTotals: WorkTotals = {};
    for (const key of Object.keys(current.totals)) {
      const cumulative = current.totals[key];
      if (cumulative === undefined) continue;
      const spent = thatDay?.[key as ZhihuMetricKey];
      const value = spent === undefined ? cumulative : cumulative - spent;
      if (value < 0 || value > cumulative) throw new ZhihuInconsistentError();
      nextTotals[key] = value;
    }
    rows.unshift({ day: addDays(day, -1), totals: nextTotals });
  }
  // unshift 是从旧往新加在头上，本身就是升序
  return rows;
}
