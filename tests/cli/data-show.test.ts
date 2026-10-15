import { describe, expect, it } from "vitest";
import {
  executeDataShow,
  renderDataShow,
  type DataShowFull,
  type DataShowResult,
} from "../../src/cli/commands/data-show.js";
import { LeafPressError } from "../../src/shared/errors.js";
import {
  dataset,
  emptyDataset,
  fakeUseCases,
  quietBlog,
  spyUseCases,
  umamiBlog,
} from "./data-show-fixtures.js";

function full(result: DataShowResult): DataShowFull {
  if (!result.hasData) throw new Error("应该有数据");
  return result;
}

describe("leafpress data show：计算", () => {
  it("所有账号都没有数据：不算走势和排行，只留概况", () => {
    const spy = spyUseCases(emptyDataset);
    const result = executeDataShow(spy.useCases);
    expect(spy.bootstrap).toHaveBeenCalledOnce();
    expect(spy.dataset).toHaveBeenCalledOnce();
    expect(result.hasData).toBe(false);
    expect(result.scoped).toBe(false);
    expect(result.summaries.map((summary) => summary.account.id)).toEqual([
      "zhihu-1",
      "blog-1",
      "blog-2",
    ]);
    expect(renderDataShow(result)).toBe(
      "还没有数据：拿数据的工具接上并拉过一次之后才有",
    );
  });

  it("按共享统计算概况、4 周走势和近 7 天增长排行", () => {
    const result = full(
      executeDataShow(fakeUseCases(), { range: "4w", by: "growth", top: 3 }),
    );
    expect(
      result.summaries.map((summary) => [
        summary.account.id,
        summary.hasData,
        summary.followersKnown,
        summary.dataThrough,
      ]),
    ).toEqual([
      ["zhihu-1", true, true, "2026-10-07"],
      ["blog-1", false, false, null],
      ["blog-2", true, false, "2026-10-04"],
    ]);
    expect(result.summaries[0]).toMatchObject({
      followers: 102,
      reads7d: 42,
      interactions7d: 28,
      postsThisWeek: 2,
    });
    // 没数据的号发了作品也算本周发布
    expect(result.summaries[1]).toMatchObject({
      postsThisWeek: 1,
      lastPublishedAt: "2026-10-07",
    });
    expect(result.series.followers.points).toHaveLength(28);
    expect(result.top.map((item) => item.work.id)).toEqual([
      "w-second",
      "w-first",
      "w-blog",
    ]);
  });

  it("--account 同时限定概况、走势范围和排行", () => {
    const result = full(
      executeDataShow(fakeUseCases(), {
        account: "zhihu-1",
        range: "4w",
        top: 3,
        by: "reach",
      }),
    );
    expect(result.scoped).toBe(true);
    expect(result.summaries.map((summary) => summary.account.id)).toEqual([
      "zhihu-1",
    ]);
    expect(result.series.reads.points).toHaveLength(28);
    expect(result.top.map((item) => item.work.id)).toEqual([
      "w-second",
      "w-first",
    ]);
  });

  it("--account 指的账号没有数据时，即使别的账号有数也按没数据处理", () => {
    const result = executeDataShow(fakeUseCases(), { account: "blog-1" });
    expect(result.hasData).toBe(false);
    expect(result.scoped).toBe(true);
    expect(result.summaries.map((summary) => summary.account.id)).toEqual([
      "blog-1",
    ]);
    expect(renderDataShow(result)).toBe("这个账号还没有数据");
  });

  it("只有作品每天的数、没有账号每天的数，也算有数（和网页数据页同一个判断）", () => {
    const usecases = fakeUseCases({
      ...emptyDataset,
      workDays: {
        "w-blog": [{ day: "2026-10-06", reads: 3, interactions: 0 }],
      },
    });
    expect(executeDataShow(usecases, { account: "blog-1" }).hasData).toBe(true);
    expect(executeDataShow(usecases, { account: "zhihu-1" }).hasData).toBe(
      false,
    );
    expect(executeDataShow(usecases).hasData).toBe(true);
  });

  it("非法范围、排序、数量和账号均为用法错误，且不去读数据", () => {
    const spy = spyUseCases();
    for (const options of [
      { range: "8w" },
      { by: "views" },
      { top: "0" },
      { top: "2.5" },
      { account: "  " },
    ]) {
      expect(() => executeDataShow(spy.useCases, options)).toThrow(
        LeafPressError,
      );
    }
    expect(spy.bootstrap).not.toHaveBeenCalled();
    expect(() =>
      executeDataShow(spy.useCases, { account: "missing-1" }),
    ).toThrow("账号不存在：missing-1；可选值：zhihu-1、blog-1、blog-2");
  });
});

describe("leafpress data show：人看的输出", () => {
  it("--account 逐行渲染概况、4 周走势和作品排行", () => {
    const result = executeDataShow(fakeUseCases(), {
      account: "zhihu-1",
      range: "4w",
      top: 2,
      by: "reach",
    });
    const lines = renderDataShow(result).split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "截至 10月7日",
      "账号      粉丝  近 7 天浏览  比上 7 天  近 7 天互动  本周发布  上次发布  数据到",
      "一叶之桐  102   42           —          28           2         10月7日   10月7日",
      "",
    ]);
    expect(lines[4]).toBe("走势");
    expect(lines[5]).toBe("9/10  粉丝 —  浏览 0  互动 0  发布 0");
    expect(lines[32]).toBe("10/7  粉丝 102  浏览 9  互动 7  发布 1");
    expect(lines.slice(-4)).toEqual([
      "作品排行",
      "#  作品        账号      浏览  互动  近 7 天",
      "1  第二篇作品  一叶之桐  700   10    +30",
      "2  第一篇作品  一叶之桐  500   20    +19",
    ]);
  });

  it("没数据的号：数字写「—」，本周发布照写篇数；拿不到粉丝的号粉丝写「—」，数据到写最后有数的那天", () => {
    const lines = renderDataShow(executeDataShow(fakeUseCases())).split("\n");
    expect(lines.slice(0, 5)).toEqual([
      "截至 10月7日",
      "账号          粉丝  近 7 天主数据  比上 7 天  近 7 天互动 / 访客  本周发布  上次发布  数据到",
      "一叶之桐      102   42             —          28                  2         10月7日   10月7日",
      "技术博客      —     —              —          —                   1         10月7日   —",
      "访问统计博客  —     20             —          0                   0         —         10月4日",
    ]);
  });

  it("列名按平台取名：只有知乎叫互动，只有博客叫访客，混着写「互动 / 访客」", () => {
    // 只有知乎：列名是互动，走势也是互动
    const zhihuLines = renderDataShow(
      executeDataShow(fakeUseCases(), {
        account: "zhihu-1",
        range: "4w",
        top: 2,
      }),
    ).split("\n");
    expect(zhihuLines[1]).toBe(
      "账号      粉丝  近 7 天浏览  比上 7 天  近 7 天互动  本周发布  上次发布  数据到",
    );
    expect(zhihuLines[5]).toBe("9/10  粉丝 —  浏览 0  互动 0  发布 0");
    expect(zhihuLines.slice(-3)[0]).toBe(
      "#  作品        账号      浏览  互动  近 7 天",
    );

    // 只有博客（blog-2，Umami 只给访问和访客）：列名和走势都叫访客
    const blogLines = renderDataShow(
      executeDataShow(fakeUseCases(), { account: "blog-2", range: "4w" }),
    ).split("\n");
    expect(blogLines[1]).toBe(
      "账号          粉丝  近 7 天访问  比上 7 天  近 7 天访客  本周发布  上次发布  数据到",
    );
    expect(blogLines[5]).toBe("9/10  粉丝 —  访问 0  访客 0  发布 0");

    // 混着：列名写「互动 / 访客」，各行是自己的数；走势合计只加互动类账号，名字叫互动
    const mixedLines = renderDataShow(
      executeDataShow(fakeUseCases(), { range: "4w", top: 3 }),
    ).split("\n");
    expect(mixedLines[1]).toBe(
      "账号          粉丝  近 7 天主数据  比上 7 天  近 7 天互动 / 访客  本周发布  上次发布  数据到",
    );
    // 各行是自己的数：知乎是互动，博客的访客看它自己那行
    expect(mixedLines[2]).toBe(
      "一叶之桐      102   42             —          28                  2         10月7日   10月7日",
    );
    expect(mixedLines[4]).toBe(
      "访问统计博客  —     20             —          0                   0         —         10月4日",
    );
    // 排行列出来混着几个平台：列名写「互动 / 访客」，每行是它自己的数
    expect(mixedLines.slice(-4)[0]).toBe(
      "#  作品        账号      主数据  互动 / 访客  近 7 天",
    );
    expect(mixedLines.at(-1)).toBe(
      "3  博客文章    技术博客  300     0            —",
    );
  });

  it("12 周走势最后一周没过完，标签后写到哪天；4 周按天，不写", () => {
    const twelve = renderDataShow(executeDataShow(fakeUseCases())).split("\n");
    const start = twelve.indexOf("走势");
    // 7/20 到 9/21 这 10 周早于首次粉丝观测，显示空值；9/28 那周有 10-01 到 10-04 的数；
    // 最后一周只有 10-05 到 10-07 三天，标签后写明到哪天
    expect(twelve.slice(start + 1, start + 13)).toEqual([
      "7/20  粉丝 —  主数据 0  互动 0  发布 0",
      "7/27  粉丝 —  主数据 0  互动 0  发布 0",
      "8/3  粉丝 —  主数据 0  互动 0  发布 0",
      "8/10  粉丝 —  主数据 0  互动 0  发布 0",
      "8/17  粉丝 —  主数据 0  互动 0  发布 0",
      "8/24  粉丝 —  主数据 0  互动 0  发布 0",
      "8/31  粉丝 —  主数据 0  互动 0  发布 0",
      "9/7  粉丝 —  主数据 0  互动 0  发布 0",
      "9/14  粉丝 —  主数据 0  互动 0  发布 0",
      "9/21  粉丝 —  主数据 0  互动 0  发布 0",
      "9/28  粉丝 93  主数据 38  互动 10  发布 0",
      "10/5（到10月7日）  粉丝 102  主数据 24  互动 18  发布 3",
    ]);
    const four = renderDataShow(
      executeDataShow(fakeUseCases(), { range: "4w" }),
    );
    expect(four).not.toContain("（到");
  });

  it("选中的账号都拿不到粉丝数：走势里粉丝写「—」；只有博客时第二个数叫访客", () => {
    const lines = renderDataShow(
      executeDataShow(fakeUseCases(), { account: "blog-2", range: "4w" }),
    ).split("\n");
    expect(lines[lines.indexOf("走势") + 1]).toBe(
      "9/10  粉丝 —  访问 0  访客 0  发布 0",
    );
    expect(lines.slice(-2)).toEqual(["作品排行", "没有可排行的作品"]);
  });

  it("只有博客：走势合计访客，名字叫「访客」；概况和排行的列名也叫访客", () => {
    const blogs = fakeUseCases(dataset, [quietBlog, umamiBlog]);
    const lines = renderDataShow(executeDataShow(blogs)).split("\n");
    expect(lines[1]).toBe(
      "账号          粉丝  近 7 天访问  比上 7 天  近 7 天访客  本周发布  上次发布  数据到",
    );
    expect(lines[2]).toBe(
      "技术博客      —     —            —          —            1         10月7日   —",
    );
    expect(lines[3]).toBe(
      "访问统计博客  —     20           —          0            0         —         10月4日",
    );
    // 选中的账号全是没有互动类数据项的博客：合计访客，走势里的名字是「访客」
    const series = lines[lines.indexOf("走势") + 1] ?? "";
    expect(series).toBe("7/20  粉丝 —  访问 0  访客 0  发布 0");
  });
});
