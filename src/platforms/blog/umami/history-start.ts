/**
 * 补历史从哪天开始。
 *
 * 起点 = 最晚的这三个日期：
 * 1. 半年窗口的第一天（调用方给的「全站第一天有数据的日期」已经不早于它）；
 * 2. 全站第一天有数据的日期；
 * 3. 「还没有累计数据的作品」里最早的发布日期的前一天：文章发布之前不会有访问，
 *    前一天那条全 0 快照是它的起点。
 * 这样第一次导入照旧补满半年，以后每发一篇新文章，只补它发布前一天到昨天的几天。
 *
 * 几种特殊情况：
 * - 这些作品里有没写发布日期的，不按发布日期收窄；
 * - 账号从没拉过：账号每天是全站的数，和文章什么时候发的无关，要补满，不按发布日期收窄；
 * - 账号以前拉过：起点不晚于上次拉到的后一天，账号每天和老作品的快照才接得上，中间不漏天；
 * - 起点不晚于昨天（比如作品今天才发布）。
 */
import { addDays, maxDay, minDay } from "@leafpress/core";
import type { DayKey } from "@leafpress/core";

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export interface HistoryStartInput {
  /** 全站第一天有数据的日期（已经不早于半年窗口的第一天） */
  firstDataDay: DayKey;
  /** 还没有累计数据的作品的发布日期；没写（或写得不对）的是 undefined */
  freshPublishedDays: readonly (DayKey | undefined)[];
  /** 上次拉到的后一天；账号从没拉过是 undefined */
  dayAfterLastPull: DayKey | undefined;
  yesterday: DayKey;
}

export function historyStart(input: HistoryStartInput): DayKey {
  const { firstDataDay, freshPublishedDays, dayAfterLastPull, yesterday } =
    input;
  if (dayAfterLastPull === undefined) return firstDataDay;

  const published = freshPublishedDays.filter(
    (day): day is DayKey => day !== undefined && DAY_FORMAT.test(day),
  );
  let start = firstDataDay;
  if (published.length > 0 && published.length === freshPublishedDays.length) {
    const earliest = published.reduce((a, b) => (a <= b ? a : b));
    start = maxDay(start, addDays(earliest, -1));
  }
  return minDay(
    maxDay(firstDataDay, minDay(start, dayAfterLastPull)),
    yesterday,
  );
}
