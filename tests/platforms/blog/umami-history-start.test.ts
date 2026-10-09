import { describe, expect, it } from "vitest";

import { historyStart } from "../../../src/platforms/blog/umami/history-start.js";

/** 半年窗口第一天之后、全站第一天有数据：2026-04-10；昨天：2026-10-08 */
const BASE = {
  firstDataDay: "2026-04-10",
  yesterday: "2026-10-08",
};

describe("补历史的起点", () => {
  it("只有一篇三天前发布的新作品没数据：从它发布的前一天开始", () => {
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-10-06"],
        dayAfterLastPull: "2026-10-08",
      }),
    ).toBe("2026-10-05");
  });

  it("新旧作品都没数据：老作品发布得比半年窗口还早，照旧补满半年", () => {
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-03-01", "2026-10-06"],
        dayAfterLastPull: "2026-10-08",
      }),
    ).toBe("2026-04-10");
  });

  it("老作品发布在窗口里：从它发布的前一天开始，比整个半年短", () => {
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-06-01", "2026-10-06"],
        dayAfterLastPull: "2026-10-08",
      }),
    ).toBe("2026-05-31");
  });

  it("没有发布日期（或写得不对）的作品不按发布日期收窄", () => {
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-10-06", undefined],
        dayAfterLastPull: "2026-10-08",
      }),
    ).toBe("2026-04-10");
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["十月六日"],
        dayAfterLastPull: "2026-10-08",
      }),
    ).toBe("2026-04-10");
  });

  it("账号从没拉过：账号每天要补满，不按作品的发布日期收窄", () => {
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-10-06"],
        dayAfterLastPull: undefined,
      }),
    ).toBe("2026-04-10");
  });

  it("新作品发布得比上次拉到的后一天还晚：起点退到那一天，中间不漏天", () => {
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-10-07"],
        dayAfterLastPull: "2026-10-05",
      }),
    ).toBe("2026-10-05");
  });

  it("起点不早于全站第一天有数据的日期", () => {
    expect(
      historyStart({
        firstDataDay: "2026-10-04",
        yesterday: "2026-10-08",
        freshPublishedDays: ["2026-09-01"],
        dayAfterLastPull: "2026-10-01",
      }),
    ).toBe("2026-10-04");
  });

  it("起点不晚于昨天：作品今天才发布，或发布日期写在了将来", () => {
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-10-09"],
        dayAfterLastPull: "2026-10-09",
      }),
    ).toBe("2026-10-08");
    expect(
      historyStart({
        ...BASE,
        freshPublishedDays: ["2026-10-12"],
        dayAfterLastPull: "2026-10-09",
      }),
    ).toBe("2026-10-08");
  });
});
