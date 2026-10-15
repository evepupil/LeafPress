import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addDays,
  dayOfDate,
  formatDay,
  reportWeeks,
  weekStartOf,
  type Account,
  type DayKey,
} from "@leafpress/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  parseJson,
  sharedExpectations,
  slimAccount,
  slimRanked,
  slimSeries,
  slimSummary,
  type ShownData,
  type ShownReport,
} from "./data-report-expect.js";
import {
  invoke,
  runCli,
  setupLargeAccounts,
  setupTwoAccounts,
} from "./data-report-helpers.js";

let tempHome: string;
let today: DayKey;

beforeAll(() => {
  tempHome = mkdtempSync(join(tmpdir(), "leafpress-readonly-report-"));
  today = dayOfDate(new Date());
}, 120_000);

afterAll(() => {
  if (tempHome !== undefined)
    rmSync(tempHome, { recursive: true, force: true });
});

describe("已构建 data show / report：两个账号，一个有数据、一个没有", () => {
  let home: string;
  let zhihu: Account;
  let blog: Account;

  beforeAll(() => {
    home = join(tempHome, "two-accounts");
    ({ zhihu, blog } = setupTwoAccounts(home, today));
    // 账号编号的序号是全局递增的：知乎是 1，博客是 2（编号一律从返回里取）
    expect([zhihu.id, blog.id]).toEqual(["zhihu-1", "blog-2"]);
  }, 60_000);

  it("data show --json：数和共享规则一致，账号作品只带必要字段，粉丝拿不到写 null", async () => {
    const expected = await sharedExpectations(home, tempHome);
    const stdout = invoke(home, ["--json", "data", "show"]);
    expect(parseJson<ShownData>(stdout)).toEqual({
      ok: true,
      today: expected.today,
      latestDay: expected.latestDay,
      hasData: true,
      summaries: expected.summaries.map(slimSummary),
      series: slimSeries(expected.series),
      top: expected.top.map(slimRanked),
    });
    // 具体的数：知乎号 today-4 到 today-2 三天，昨天没拉到；博客号什么数据都没有。
    // 同一秒建的账号按编号排（blog 在 zhihu 前），所以按编号找，不按位置取
    const { summaries } = parseJson<ShownData>(stdout);
    const zhihuSummary = summaries.find((s) => s.account.id === zhihu.id);
    const blogSummary = summaries.find((s) => s.account.id === blog.id);
    expect(zhihuSummary).toMatchObject({
      account: slimAccount(zhihu),
      hasData: true,
      followers: 110,
      reads7d: 90,
      interactions7d: 9,
      dataThrough: addDays(today, -2),
    });
    expect(blogSummary).toMatchObject({
      account: slimAccount(blog),
      hasData: false,
      followers: null,
      followers7d: null,
      followers30d: null,
      weeklyGain: null,
      dataThrough: null,
    });
    // 没数据的号发了作品也算本周发布：今天发的这篇一定在本周
    expect(blogSummary?.postsThisWeek).toBeGreaterThanOrEqual(1);
    expect(stdout).not.toContain("档案");
  }, 30_000);

  it("--account 指的是没数据的号：JSON 只有概况，人看的输出只有一句话", async () => {
    const expected = await sharedExpectations(home, tempHome);
    const blogSummary = expected.summaries.find(
      (summary) => summary.account.id === blog.id,
    );
    if (blogSummary === undefined) throw new Error("缺少博客号概况");
    const stdout = invoke(home, [
      "--json",
      "data",
      "show",
      "--account",
      blog.id,
    ]);
    expect(parseJson<ShownData>(stdout)).toEqual({
      ok: true,
      today: expected.today,
      latestDay: expected.latestDay,
      hasData: false,
      summaries: [slimSummary(blogSummary)],
    });
    expect(invoke(home, ["data", "show", "--account", blog.id])).toBe(
      "这个账号还没有数据\n",
    );
  }, 30_000);

  it("--account 指的是有数据的号：走势和排行只算这个号，--range、--top、--by 生效", () => {
    const shown = parseJson<ShownData>(
      invoke(home, [
        "--json",
        "data",
        "show",
        "--account",
        zhihu.id,
        "--range",
        "4w",
        "--top",
        "1",
        "--by",
        "interactions",
      ]),
    );
    expect(shown.hasData).toBe(true);
    expect(shown.summaries.map((summary) => summary.account)).toEqual([
      slimAccount(zhihu),
    ]);
    expect(shown.series?.["reads"]?.points).toHaveLength(28);
    // 走势的点只有标签、起止日期和两个值
    expect(Object.keys(shown.series?.["reads"]?.points[0] ?? {})).toEqual([
      "label",
      "start",
      "end",
      "value",
      "compare",
    ]);
    expect(shown.top).toHaveLength(1);
    expect(shown.top?.[0]?.account).toEqual(slimAccount(zhihu));
  }, 30_000);

  it("data show 人看的输出：没数据的号数字写「—」、本周发布照写，数据到写最后有数的那天", () => {
    const text = invoke(home, ["data", "show"]);
    const lines = text.split("\n");
    expect(lines[0]).toBe(`截至 ${formatDay(addDays(today, -1), today)}`);
    expect(lines[1]).toContain("数据到");
    const zhihuLine = lines.find((line) => line.startsWith("集成账号")) ?? "";
    expect(zhihuLine).toMatch(
      /^集成账号\s+110\s+90\s+\S+\s+9\s+\d+\s+\S+\s+\S+$/,
    );
    expect(zhihuLine.endsWith(formatDay(addDays(today, -2), today))).toBe(true);
    const blogLine = lines.find((line) => line.startsWith("无数据博客")) ?? "";
    expect(blogLine).toMatch(
      /^无数据博客\s+—\s+—\s+—\s+—\s+[1-9]\d*\s+\S+\s+—$/,
    );
    expect(text).toContain("走势");
    expect(text).toContain("作品排行");
    // 最后一周没过完时（昨天不是周日）标签后写到哪天
    const yesterday = addDays(today, -1);
    const partial = addDays(weekStartOf(yesterday), 6) > yesterday;
    expect(text.includes("（到")).toBe(partial);
  }, 30_000);

  it("report：后加进来但有旧数据的账号也在分账号表里，JSON 和人看的输出都对", async () => {
    const expected = await sharedExpectations(home, tempHome);
    const { report } = parseJson<ShownReport>(
      invoke(home, ["--json", "report"]),
    );
    expect(report.week).toBe(expected.report.week);
    expect(report.digest).toEqual(expected.report.digest);
    expect(report.note).toEqual(expected.report.note);
    // 两个账号 since 都是今天：旧规则下表是空的，现在靠「周末之前有数据 / 发过作品」列出来
    expect(report.rows.map((row) => row.account.id)).toEqual(
      expected.report.rows.map((row) => row.account.id),
    );
    expect(report.rows.map((row) => row.account.id).sort()).toEqual(
      [zhihu.id, blog.id].sort(),
    );
    const zhihuRow = report.rows.find((row) => row.account.id === zhihu.id);
    const blogRow = report.rows.find((row) => row.account.id === blog.id);
    expect(zhihuRow?.account).toEqual(slimAccount(zhihu));
    expect(blogRow).toMatchObject({
      hasData: false,
      followersStart: null,
      followersEnd: null,
      delta: null,
    });
    expect(report.totals.delta).toBe(expected.report.totals.delta);
    expect(report.published.map((item) => item.work.id)).toEqual(
      expected.report.published.map((item) => item.work.id),
    );

    const human = invoke(home, ["report"]);
    expect(human).toContain("周报");
    expect(human).toContain("分账号");
    expect(human).toContain("复盘");
    expect(human).toMatch(/无数据博客\s+—\s+—\s+\d+\s+—\s+—/);
  }, 30_000);

  it("参数不合法是用法错误，退出码 2", () => {
    const week = reportWeeks(today)[0];
    if (week === undefined) throw new Error("No report week available");
    for (const args of [
      ["--json", "data", "show", "--range", "8w"],
      ["--json", "report", "--week", addDays(week, 1)],
    ]) {
      const invalid = runCli(home, args);
      expect(invalid.status).toBe(2);
      expect(invalid.stderr).toBe("");
      expect(JSON.parse(invalid.stdout)).toMatchObject({
        ok: false,
        error: { code: "USAGE" },
      });
    }
  }, 30_000);
});

describe("已构建 data show / report：输出长度", () => {
  it("3 个账号、每个档案 1000 字以上、排行满 10 个作品：两条命令的 JSON 都在 15000 字以内", () => {
    const home = join(tempHome, "large");
    const accounts = setupLargeAccounts(home, today);
    for (const account of accounts)
      expect(readFileSync(account.profilePath, "utf8").length).toBeGreaterThan(
        1000,
      );

    const show = invoke(home, ["--json", "data", "show"]);
    const report = invoke(home, ["--json", "report"]);
    expect(show.length).toBeLessThan(15_000);
    expect(report.length).toBeLessThan(15_000);

    const shown = parseJson<ShownData>(show);
    expect(shown.summaries).toHaveLength(3);
    expect(shown.top).toHaveLength(10);
    expect(parseJson<ShownReport>(report).report.published).toHaveLength(12);
    // 档案和作品详情都没带进来
    for (const text of [show, report]) {
      expect(text).not.toContain("档案全文");
      expect(text).not.toContain("作品记录");
    }
  }, 60_000);
});

describe("已构建 data show / report：没初始化", () => {
  it("只读命令使用 usage 退出码且不创建文件", () => {
    const newHome = join(tempHome, "uninitialized");
    for (const args of [["data", "show"], ["report"]]) {
      const result = runCli(newHome, ["--json", ...args]);
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "USAGE",
          message: "还没初始化",
          hint: "先运行 leafpress init",
        },
      });
    }
    expect(existsSync(newHome)).toBe(false);
    expect(readdirSync(tempHome)).not.toContain("uninitialized");
  });
});
