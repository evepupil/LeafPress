import { describe, expect, it } from "vitest";
import {
  dataShowPayload,
  executeDataShow,
} from "../../src/cli/commands/data-show.js";
import { fakeUseCases } from "./data-show-fixtures.js";

describe("leafpress data show：--json 内容", () => {
  it("账号只带 id、名称、平台，作品只带编号、标题、链接、发布日，其余的数照旧", () => {
    const payload = dataShowPayload(
      executeDataShow(fakeUseCases(), { top: 2, range: "4w" }),
    );
    expect(payload).toMatchObject({
      today: "2026-10-08",
      latestDay: "2026-10-07",
      hasData: true,
    });
    expect(payload.summaries[0]).toMatchObject({
      account: { id: "zhihu-1", name: "一叶之桐", platform: "zhihu" },
      followers: 102,
      reads7d: 42,
      dataThrough: "2026-10-07",
    });
    expect(Object.keys(payload.summaries[0]?.account ?? {})).toEqual([
      "id",
      "name",
      "platform",
    ]);
    expect(payload.top?.[0]).toEqual({
      work: {
        id: "w-second",
        title: "第二篇作品",
        url: "https://zhuanlan.zhihu.com/p/2",
        publishedAt: "2026-10-07",
      },
      account: { id: "zhihu-1", name: "一叶之桐", platform: "zhihu" },
      reach: 700,
      interactions: 10,
      growth: 30,
      rate: 10 / 700,
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("档案全文");
    expect(text).not.toContain("作品记录");
    expect(text).not.toContain("写作要求全文");
  });

  it("走势的点只带标签、起止日期、本期和上一期的值，不带给人看的 title", () => {
    const twelve = dataShowPayload(executeDataShow(fakeUseCases())).series;
    expect(twelve?.reads.points[0]).toEqual({
      label: "7/20",
      start: "2026-07-20",
      end: "2026-07-26",
      value: 0,
      compare: 0,
    });
    // 最后一周只有周一到周三，算到数据的最后一天
    expect(twelve?.reads.points.at(-1)).toEqual({
      label: "10/5",
      start: "2026-10-05",
      end: "2026-10-07",
      value: 24,
      compare: 0,
    });
    expect(JSON.stringify(twelve)).not.toContain("title");
    const four = dataShowPayload(
      executeDataShow(fakeUseCases(), { range: "4w" }),
    ).series;
    expect(four?.reads.points.at(-1)).toEqual({
      label: "10/7",
      start: "2026-10-07",
      end: "2026-10-07",
      value: 9,
      compare: 0,
    });
  });

  it("粉丝拿不到时粉丝和增减写 null，没数据的号 dataThrough 写 null", () => {
    const payload = dataShowPayload(executeDataShow(fakeUseCases()));
    expect(payload.summaries[2]).toMatchObject({
      account: { id: "blog-2", name: "访问统计博客", platform: "blog" },
      hasData: true,
      dataThrough: "2026-10-04",
      followers: null,
      followers7d: null,
      followers30d: null,
      weeklyGain: null,
      reads7d: 20,
    });
    expect(payload.summaries[1]).toMatchObject({
      hasData: false,
      dataThrough: null,
      followers: null,
      postsThisWeek: 1,
    });
    // 全部账号里有拿得到粉丝的（知乎），粉丝线照常给
    expect(payload.series?.followers?.available).toBe(true);
    const blogOnly = dataShowPayload(
      executeDataShow(fakeUseCases(), { account: "blog-2" }),
    );
    expect(blogOnly.series?.followers).toBeNull();
    expect(blogOnly.series?.reads.available).toBe(true);
  });

  it("没有数据时只给概况，不带走势和排行", () => {
    const payload = dataShowPayload(
      executeDataShow(fakeUseCases(), { account: "blog-1" }),
    );
    expect(payload.hasData).toBe(false);
    expect(Object.keys(payload)).toEqual([
      "today",
      "latestDay",
      "hasData",
      "summaries",
    ]);
  });
});
