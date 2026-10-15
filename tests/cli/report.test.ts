import type { WeeklyNote } from "@leafpress/core";
import { describe, expect, it } from "vitest";
import {
  executeReport,
  renderReport,
  reportPayload,
} from "../../src/cli/commands/report.js";
import { LeafPressError } from "../../src/shared/errors.js";
import {
  dataset,
  fakeUseCases,
  quietBlog,
  spyUseCases,
  umamiBlog,
  zhihu,
} from "./data-show-fixtures.js";

const note: WeeklyNote = {
  week: "2026-10-05",
  wins: "按时发布",
  improve: "标题还可更清楚",
  next: "整理读者反馈",
  updatedAt: "2026-10-08T08:00:00.000Z",
};

describe("leafpress report：计算", () => {
  it("默认选昨天所在的那一周（可能没过完），调用共享周报并带上复盘笔记", () => {
    const spy = spyUseCases(dataset, undefined, [note]);
    const result = executeReport(spy.useCases);
    expect(spy.bootstrap).toHaveBeenCalledOnce();
    expect(spy.dataset).toHaveBeenCalledOnce();
    expect(result.report).toMatchObject({
      week: "2026-10-05",
      end: "2026-10-07",
      complete: false,
      followersKnown: true,
      totals: { delta: 9, posts: 3, reads: 24, interactions: 18 },
      note,
    });
    expect(result.report.published.map((item) => item.work.id)).toEqual([
      "w-first",
      "w-blog",
      "w-second",
    ]);
  });

  it("允许选择可选周列表中的周一", () => {
    const result = executeReport(fakeUseCases(), "2026-09-28");
    expect(result.report).toMatchObject({
      week: "2026-09-28",
      end: "2026-10-04",
      complete: true,
      totals: { delta: null, posts: 0, reads: 38, interactions: 10 },
    });
    expect(result.report.rows[0]).toMatchObject({
      followersStart: null,
      followersEnd: 93,
      delta: null,
    });
    const report = reportPayload(result).report;
    expect(report.rows[0]).toMatchObject({
      followersStart: null,
      followersEnd: 93,
      delta: null,
    });
    expect(report.totals.delta).toBeNull();
    const accountLine = renderReport(result)
      .split("\n")
      .find((line) => line.startsWith("一叶之桐"));
    expect(accountLine).toContain("— → 93");
    expect(accountLine).toContain("—");
    expect(result.report.published).toEqual([]);
  });

  it("非法日期、非周一和超出可选周均为用法错误并提示周列表", () => {
    for (const week of ["not-a-date", "2026-10-06", "2026-08-03"]) {
      const failure: unknown = (() => {
        try {
          executeReport(fakeUseCases(), week);
          return undefined;
        } catch (error) {
          return error;
        }
      })();
      expect(failure).toBeInstanceOf(LeafPressError);
      expect((failure as LeafPressError).code).toBe("USAGE");
      expect((failure as LeafPressError).message).toContain("2026-10-05");
    }
  });
});

describe("leafpress report：人看的输出", () => {
  it("逐行渲染本周小结、账号表、作品和三栏复盘；没数据、拿不到粉丝的号写「—」，发布篇数照写", () => {
    const result = executeReport(fakeUseCases(dataset, undefined, [note]));
    expect(renderReport(result).split("\n")).toEqual([
      "10月5日 – 10月11日周报（到10月7日）",
      "",
      "小结",
      "本周到周三发了 3 篇：知乎 2 篇、博客 1 篇。",
      "粉丝合计 +9，其中一叶之桐（知乎）+9。",
      "浏览 24，比上周 —；《第二篇作品》最多（30）。",
      "",
      "分账号",
      "账号          粉丝      增减  发布  主数据  互动 / 访客",
      "一叶之桐      93 → 102  +9    2     24      18",
      "技术博客      —         —     1     —       —",
      "访问统计博客  —         —     0     0       0",
      "",
      "这周发布",
      "作品        账号      发布日期  主数据",
      "第一篇作品  一叶之桐  10月6日   500",
      "博客文章    技术博客  10月7日   300",
      "第二篇作品  一叶之桐  10月7日   700",
      "",
      "复盘",
      "做得好：按时发布",
      "需要改进：标题还可更清楚",
      "下一步：整理读者反馈",
    ]);
  });

  it("过完的一周标题不带「到」，复盘三栏都为空时不渲染复盘段", () => {
    const emptyNote = { ...note, wins: "", improve: "", next: "" };
    const lines = renderReport(
      executeReport(fakeUseCases(dataset, undefined, [emptyNote])),
    ).split("\n");
    expect(lines).not.toContain("复盘");
    const complete = renderReport(
      executeReport(fakeUseCases(), "2026-09-28"),
    ).split("\n");
    expect(complete[0]).toBe("9月28日 – 10月4日周报");
  });

  it("所有账号都拿不到粉丝数：小结不写粉丝合计，账号表粉丝和增减写「—」", () => {
    const result = executeReport(fakeUseCases(dataset, [quietBlog, umamiBlog]));
    const lines = renderReport(result).split("\n");
    expect(lines.slice(2, 5)).toEqual([
      "小结",
      "本周到周三发了 1 篇：博客 1 篇。",
      "浏览 0，比上周 —。",
    ]);
    expect(lines.slice(7, 10)).toEqual([
      "账号          粉丝  增减  发布  访问  访客",
      "技术博客      —     —     1     —     —",
      "访问统计博客  —     —     0     0     0",
    ]);
  });

  it("列名按各行账号的平台取名：只有知乎叫互动，只有博客叫访客，混着写「互动 / 访客」", () => {
    // 只有知乎：列名是互动
    const zhihuLines = renderReport(
      executeReport(fakeUseCases(dataset, [zhihu])),
    ).split("\n");
    const zhihuHead = zhihuLines.indexOf("分账号") + 1;
    expect(zhihuLines[zhihuHead]).toBe(
      "账号      粉丝      增减  发布  浏览  互动",
    );

    // 只有博客：列名是访客（在上一条测试里验证过访问那列，这里再确认名字）
    const blogLines = renderReport(
      executeReport(fakeUseCases(dataset, [quietBlog, umamiBlog])),
    ).split("\n");
    expect(blogLines[blogLines.indexOf("分账号") + 1]).toBe(
      "账号          粉丝  增减  发布  访问  访客",
    );

    // 混着：知乎和博客都在表里，列名写「互动 / 访客」
    const mixedLines = renderReport(
      executeReport(fakeUseCases(dataset, [zhihu, umamiBlog])),
    ).split("\n");
    expect(mixedLines[mixedLines.indexOf("分账号") + 1]).toBe(
      "账号          粉丝      增减  发布  主数据  互动 / 访客",
    );
    expect(
      mixedLines[mixedLines.indexOf("分账号") + 2]?.startsWith("一叶之桐"),
    ).toBe(true);
  });
});

describe("leafpress report：--json 内容", () => {
  it("账号和作品只带必要的字段，其余的数照旧", () => {
    const payload = reportPayload(
      executeReport(fakeUseCases(dataset, undefined, [note])),
    );
    const { report } = payload;
    expect(report).toMatchObject({
      week: "2026-10-05",
      end: "2026-10-07",
      complete: false,
      totals: { delta: 9, posts: 3, reads: 24, interactions: 18 },
      readsChange: null,
      note,
    });
    expect(report.rows[0]).toEqual({
      account: { id: "zhihu-1", name: "一叶之桐", platform: "zhihu" },
      hasData: true,
      followersStart: 93,
      followersEnd: 102,
      delta: 9,
      posts: 2,
      reads: 24,
      interactions: 18,
      best: {
        item: {
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
        },
        weekReads: 30,
      },
    });
    expect(report.published[1]?.work).toEqual({
      id: "w-blog",
      title: "博客文章",
      url: null,
      publishedAt: "2026-10-07",
    });
    const text = JSON.stringify(payload);
    for (const leaked of [
      "档案全文",
      "作品记录",
      "写作要求全文",
      "反馈历史全文",
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("粉丝拿不到时粉丝和增减写 null，合计只在一个账号都拿不到时才是 null", () => {
    const { report } = reportPayload(executeReport(fakeUseCases()));
    expect(report.rows.map((row) => [row.hasData, row.delta])).toEqual([
      [true, 9],
      [false, null],
      [true, null],
    ]);
    expect(report.rows[2]).toMatchObject({
      account: { id: "blog-2", name: "访问统计博客", platform: "blog" },
      followersStart: null,
      followersEnd: null,
      delta: null,
      reads: 0,
    });
    expect(report.totals.delta).toBe(9);

    const blogsOnly = reportPayload(
      executeReport(fakeUseCases(dataset, [quietBlog, umamiBlog])),
    ).report;
    expect(blogsOnly.totals).toEqual({
      delta: null,
      posts: 1,
      reads: 0,
      interactions: 0,
    });
    expect(blogsOnly.digest).not.toContainEqual(
      expect.stringContaining("粉丝合计"),
    );
  });
});
