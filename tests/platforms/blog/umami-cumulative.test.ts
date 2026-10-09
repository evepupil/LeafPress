import { describe, expect, it } from "vitest";

import {
  cumulativeSeries,
  snapshotsOf,
} from "../../../src/platforms/blog/umami/cumulative.js";
import { UmamiInconsistentError } from "../../../src/platforms/blog/umami/errors.js";

/** 每天的单日访问表；没写的天算 0 */
function daily(table: Record<string, number>): (day: string) => number {
  return (day) => table[day] ?? 0;
}

describe("cumulativeSeries：累计(d) = 累计(昨天) − Σ 当天访问(d+1 … 昨天)", () => {
  it("规格里的例子：10/8 累计 100，10/8 当天 5、10/7 当天 3 → 10/7 累计 95、10/6 累计 92", () => {
    const requested: string[] = [];
    const points = cumulativeSeries({
      start: "2026-10-06",
      yesterday: "2026-10-08",
      total: 100,
      daily: (day) => {
        requested.push(day);
        return daily({ "2026-10-08": 5, "2026-10-07": 3 })(day);
      },
    });

    expect(points).toEqual([
      { day: "2026-10-06", pageviews: 92 },
      { day: "2026-10-07", pageviews: 95 },
      { day: "2026-10-08", pageviews: 100 },
    ]);
    // 只问「起点后一天到昨天」，起点那天自己的单日数用不上
    expect(requested.sort()).toEqual(["2026-10-07", "2026-10-08"]);
  });

  it("起点就是昨天：只有昨天一个点，不问任何单日数", () => {
    const points = cumulativeSeries({
      start: "2026-10-08",
      yesterday: "2026-10-08",
      total: 7,
      daily: () => {
        throw new Error("不该问单日数");
      },
    });
    expect(points).toEqual([{ day: "2026-10-08", pageviews: 7 }]);
  });

  it("累计倒推成负数：整次失败", () => {
    expect(() =>
      cumulativeSeries({
        start: "2026-10-06",
        yesterday: "2026-10-08",
        total: 5,
        daily: daily({ "2026-10-08": 3, "2026-10-07": 3 }),
      }),
    ).toThrow(UmamiInconsistentError);
  });

  it("单日访问是负数（倒推的累计往前变大，按日期下降）：整次失败", () => {
    expect(() =>
      cumulativeSeries({
        start: "2026-10-06",
        yesterday: "2026-10-08",
        total: 10,
        daily: daily({ "2026-10-08": -2 }),
      }),
    ).toThrow("Umami 的数前后对不上，这次没入库");
  });

  it("累计或单日不是有限的数：整次失败", () => {
    expect(() =>
      cumulativeSeries({
        start: "2026-10-07",
        yesterday: "2026-10-08",
        total: Number.NaN,
        daily: () => 0,
      }),
    ).toThrow(UmamiInconsistentError);
    expect(() =>
      cumulativeSeries({
        start: "2026-10-07",
        yesterday: "2026-10-08",
        total: 5,
        daily: () => Number.NaN,
      }),
    ).toThrow(UmamiInconsistentError);
  });
});

describe("snapshotsOf：累计变成快照", () => {
  const points = [
    { day: "2026-10-04", pageviews: 0 },
    { day: "2026-10-05", pageviews: 0 },
    { day: "2026-10-06", pageviews: 4 },
    { day: "2026-10-07", pageviews: 6 },
    { day: "2026-10-08", pageviews: 9 },
  ];

  it("累计为 0 的天不写；第一次非零的前一天写全 0 快照；只有昨天带访客", () => {
    expect(snapshotsOf(points, 5, false)).toEqual([
      { day: "2026-10-05", totals: { pageviews: 0, visitors: 0 } },
      { day: "2026-10-06", totals: { pageviews: 4 } },
      { day: "2026-10-07", totals: { pageviews: 6 } },
      { day: "2026-10-08", totals: { pageviews: 9, visitors: 5 } },
    ]);
  });

  it("一直是 0：什么都不写", () => {
    expect(
      snapshotsOf(
        [
          { day: "2026-10-07", pageviews: 0 },
          { day: "2026-10-08", pageviews: 0 },
        ],
        0,
        true,
      ),
    ).toEqual([]);
  });

  it("起点那天就有累计：前一天在查的范围外，不知道是不是 0，默认不补全 0 快照", () => {
    const fromStart = [
      { day: "2026-10-07", pageviews: 8 },
      { day: "2026-10-08", pageviews: 9 },
    ];
    expect(snapshotsOf(fromStart, 3, false)).toEqual([
      { day: "2026-10-07", totals: { pageviews: 8 } },
      { day: "2026-10-08", totals: { pageviews: 9, visitors: 3 } },
    ]);
  });

  it("确认起点之前没有访问时，起点前一天补全 0 快照", () => {
    const fromStart = [
      { day: "2026-10-07", pageviews: 8 },
      { day: "2026-10-08", pageviews: 9 },
    ];
    expect(snapshotsOf(fromStart, 3, true)).toEqual([
      { day: "2026-10-06", totals: { pageviews: 0, visitors: 0 } },
      { day: "2026-10-07", totals: { pageviews: 8 } },
      { day: "2026-10-08", totals: { pageviews: 9, visitors: 3 } },
    ]);
  });

  it("只有昨天一天就有访问：前一天写全 0（在范围内时），昨天带访客", () => {
    expect(
      snapshotsOf(
        [
          { day: "2026-10-07", pageviews: 0 },
          { day: "2026-10-08", pageviews: 2 },
        ],
        2,
        false,
      ),
    ).toEqual([
      { day: "2026-10-07", totals: { pageviews: 0, visitors: 0 } },
      { day: "2026-10-08", totals: { pageviews: 2, visitors: 2 } },
    ]);
  });
});
