import { describe, expect, it } from "vitest";

import {
  parseCumulative,
  parseDailySeries,
} from "../../../src/platforms/zhihu/api/content-stats.js";
import { ZhihuApiError } from "../../../src/platforms/zhihu/api/errors.js";

/** 官方示例形状的一条 Items（调研文档 2.4 节） */
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

describe("parseCumulative（不带日期）", () => {
  it("取各项的累计数", () => {
    const result = parseCumulative(
      envelope([
        item({
          Date: "2026-10-08",
          ViewCount: 100,
          UpvoteCount: 10,
          CollectCount: 3,
          CommentCount: 2,
          ShareCount: 1,
        }),
      ]),
    );
    expect(result).toEqual({
      views: 100,
      likes: 10,
      collects: 3,
      comments: 2,
      shares: 1,
    });
  });

  it("可选字段没返回就不写这一项，不补 0", () => {
    const result = parseCumulative(
      envelope([item({ Date: "2026-10-08", ViewCount: 50, UpvoteCount: 2 })]),
    );
    expect(result).toEqual({ views: 50, likes: 2 });
  });

  it("带「今日」数：累计减掉 Today 的部分，才是截止昨天的累计", () => {
    const result = parseCumulative(
      envelope([
        item({
          ViewCount: 100,
          UpvoteCount: 10,
          Today: { ViewCount: 4, UpvoteCount: 1 },
        }),
      ]),
    );
    expect(result).toEqual({ views: 96, likes: 9 });
  });

  it("带「今日」但 Today 里某项没返回：那项的累计照用", () => {
    const result = parseCumulative(
      envelope([item({ ViewCount: 100, Today: { UpvoteCount: 1 } })]),
    );
    expect(result).toEqual({ views: 100 });
  });

  it("没有「今日」数：当作已是截止昨天的累计", () => {
    const result = parseCumulative(
      envelope([item({ Date: "2026-10-08", ViewCount: 7 })]),
    );
    expect(result).toEqual({ views: 7 });
  });

  it("Items 是空数组：这篇没有统计数据，返回 undefined", () => {
    expect(parseCumulative(envelope([]))).toBeUndefined();
  });

  it("一条指标都没有：返回 undefined", () => {
    expect(
      parseCumulative(envelope([item({ Date: "2026-10-08" })])),
    ).toBeUndefined();
    expect(
      parseCumulative(envelope([item({ ViewCount: null })])),
    ).toBeUndefined();
  });
});

describe("parseDailySeries（带起止日期）", () => {
  it("每天一条：按日期升序返回每天的累计", () => {
    const result = parseDailySeries(
      envelope([
        item({ Date: "2026-10-08", ViewCount: 100, UpvoteCount: 10 }),
        item({ Date: "2026-10-06", ViewCount: 80 }),
        item({ Date: "2026-10-07", ViewCount: 92 }),
      ]),
    );
    expect(result).toEqual([
      { day: "2026-10-06", totals: { views: 80 } },
      { day: "2026-10-07", totals: { views: 92 } },
      { day: "2026-10-08", totals: { views: 100, likes: 10 } },
    ]);
  });

  it("只有一条（整段合计或只有一天）：返回 undefined，表示不能补历史", () => {
    expect(
      parseDailySeries(envelope([item({ Date: "2026-10-08", ViewCount: 5 })])),
    ).toBeUndefined();
    // 没有日期的合计行同样拆不出每天
    expect(
      parseDailySeries(envelope([item({ ViewCount: 5 })])),
    ).toBeUndefined();
    expect(parseDailySeries(envelope([]))).toBeUndefined();
  });

  it("各行有各自的指标：没有的不补 0", () => {
    const result = parseDailySeries(
      envelope([
        item({ Date: "2026-10-07", ViewCount: 10 }),
        item({ Date: "2026-10-08", UpvoteCount: 3, ShareCount: 1 }),
      ]),
    );
    expect(result).toEqual([
      { day: "2026-10-07", totals: { views: 10 } },
      { day: "2026-10-08", totals: { likes: 3, shares: 1 } },
    ]);
  });

  it("同一天出现多行：按最后一行", () => {
    const result = parseDailySeries(
      envelope([
        item({ Date: "2026-10-07", ViewCount: 10 }),
        item({ Date: "2026-10-08", ViewCount: 20 }),
        item({ Date: "2026-10-07", ViewCount: 11 }),
      ]),
    );
    expect(result).toEqual([
      { day: "2026-10-07", totals: { views: 11 } },
      { day: "2026-10-08", totals: { views: 20 } },
    ]);
  });
});

describe("格式不对", () => {
  it("Items 不是数组：整次失败", () => {
    expect(() => parseDailySeries({ Data: { Items: "x" } })).toThrow(
      ZhihuApiError,
    );
    expect(() => parseCumulative({ Data: {} })).toThrow(ZhihuApiError);
  });
});
