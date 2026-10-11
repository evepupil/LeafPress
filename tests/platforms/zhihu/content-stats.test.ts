import { describe, expect, it } from "vitest";

import { parseContentStats } from "../../../src/platforms/zhihu/api/content-stats.js";
import { ZhihuApiError } from "../../../src/platforms/zhihu/api/errors.js";

/**
 * 官方示例 + 实测（2026-10-10）形状的一条 Items（调研文档 2.4 节、
 * .fleet/briefs/m3-zhihu-real-api.md 第 4 条）：Metrics 是到现在的累计，
 * 嵌 Today、Yesterday（各自当天的数）。
 */
function item(metrics: Record<string, unknown>): unknown {
  return {
    ContentType: "article",
    ContentToken: "123",
    Url: "https://zhuanlan.zhihu.com/p/123",
    Title: "示例文章",
    Metrics: metrics,
  };
}

function envelope(items: unknown[]): unknown {
  return { Code: 0, Message: "success", Data: { Items: items } };
}

describe("parseContentStats（不带日期）", () => {
  it("取各项的累计数", () => {
    const result = parseContentStats(
      envelope([
        item({
          ViewCount: 100,
          UpvoteCount: 10,
          CollectCount: 3,
          CommentCount: 2,
          ShareCount: 1,
        }),
      ]),
    );
    expect(result).toEqual({
      yesterday: {
        views: 100,
        likes: 10,
        collects: 3,
        comments: 2,
        shares: 1,
      },
    });
  });

  it("可选字段没返回就不写这一项，不补 0", () => {
    const result = parseContentStats(
      envelope([item({ ViewCount: 50, UpvoteCount: 2 })]),
    );
    expect(result).toEqual({ yesterday: { views: 50, likes: 2 } });
  });

  it("带「今日」数：累计减掉 Today 的部分，才是截止昨天的累计", () => {
    const result = parseContentStats(
      envelope([
        item({
          ViewCount: 100,
          UpvoteCount: 10,
          Today: { Date: "2026-10-10", ViewCount: 4, UpvoteCount: 1 },
        }),
      ]),
    );
    expect(result).toEqual({ yesterday: { views: 96, likes: 9 } });
  });

  it("带「今日」但 Today 里某项没返回：那项的累计照用", () => {
    const result = parseContentStats(
      envelope([item({ ViewCount: 100, Today: { UpvoteCount: 1 } })]),
    );
    expect(result).toEqual({ yesterday: { views: 100 } });
  });

  it("没有「今日」数：当作已是截止昨天的累计", () => {
    const result = parseContentStats(
      envelope([item({ Date: "2026-10-08", ViewCount: 7 })]),
    );
    expect(result).toEqual({ yesterday: { views: 7 } });
  });

  it("要前天（dayBefore）：再减 Yesterday 同名项", () => {
    const result = parseContentStats(
      envelope([
        item({
          ViewCount: 100,
          Today: { ViewCount: 20 },
          Yesterday: { Date: "2026-10-09", ViewCount: 30 },
        }),
      ]),
      { dayBefore: true },
    );
    expect(result).toEqual({
      yesterday: { views: 80 },
      dayBefore: { views: 50 },
    });
  });

  it("要前天但没给 Yesterday：只有昨天那条", () => {
    const result = parseContentStats(
      envelope([
        item({
          ViewCount: 100,
          Today: { Date: "2026-10-10", ViewCount: 20 },
          // Yesterday 一个指标都没给
          Yesterday: { Date: "2026-10-09" },
        }),
      ]),
      { dayBefore: true },
    );
    expect(result).toEqual({ yesterday: { views: 80 } });
  });

  it("前天减出负数：前天那条不写，昨天照给", () => {
    const result = parseContentStats(
      envelope([
        item({
          ViewCount: 100,
          Today: { ViewCount: 20 },
          Yesterday: { ViewCount: 90 },
        }),
      ]),
      { dayBefore: true },
    );
    expect(result).toEqual({ yesterday: { views: 80 } });
  });

  it("不要前天时就算给了 Yesterday 也不算", () => {
    const result = parseContentStats(
      envelope([
        item({
          ViewCount: 100,
          Today: { ViewCount: 20 },
          Yesterday: { ViewCount: 30 },
        }),
      ]),
    );
    expect(result).toEqual({ yesterday: { views: 80 } });
  });

  it("Items 是空数组：这篇没有统计数据，返回 undefined", () => {
    expect(parseContentStats(envelope([]))).toBeUndefined();
  });

  it("一条指标都没有：返回 undefined", () => {
    expect(
      parseContentStats(envelope([item({ Date: "2026-10-08" })])),
    ).toBeUndefined();
    expect(
      parseContentStats(envelope([item({ ViewCount: null })])),
    ).toBeUndefined();
  });
});

describe("格式不对", () => {
  it("Items 不是数组：整次失败", () => {
    expect(() => parseContentStats({ Data: { Items: "x" } })).toThrow(
      ZhihuApiError,
    );
  });
});
