/**
 * 博客的导入和拉数据连起来走一遍：真实的用例 + 真实的导入工具和 Umami 拿数据工具 + 真的 git 和记录库，
 * 只有 Umami 接口是假的。验证两个工具和用例之间的约定（账号档案位置推出数据目录、上次拉到哪天、快照怎么落库）。
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  closeApp,
  createUseCases,
  openApp,
} from "../../../src/usecases/index.js";
import { createUmamiDataTool } from "../../../src/platforms/blog/umami/data.js";
import { createPlatformRuntime } from "../../../src/platforms/registry.js";
import type { PlatformRuntime } from "../../../src/platforms/types.js";
import { exists, makeBlogFixture } from "./steps-fixtures.js";
import {
  FakeUmami,
  SHARE_URL,
  noSleep,
  type Traffic,
} from "./umami-fixtures.js";

const NOW = new Date("2026-10-09T09:00:00+08:00");

function post(title: string, published: string): string {
  return [
    "---",
    `title: "${title}"`,
    'description: "测试"',
    `published: "${published}"`,
    'locale: "zh-CN"',
    'tags: ["test"]',
    "draft: false",
    "---",
    "",
    "正文。",
    "",
  ].join("\n");
}

/** 登记表：导入工具用真的；Umami 拿数据工具用真的，只是等待不真等 */
function runtime(): PlatformRuntime {
  const real = createPlatformRuntime();
  return {
    codeStep: (workflowId, stepId) => real.codeStep(workflowId, stepId),
    dataTool: (platform) =>
      platform === "blog"
        ? createUmamiDataTool({ sleep: noSleep })
        : real.dataTool(platform),
    importer: (platform) => real.importer(platform),
    questionFinder: () => undefined,
  };
}

const TRAFFIC: Traffic = {
  "2026-10-05": { "/": 2, "/posts/a/": 3, "/posts/existing-post/": 1 },
  "2026-10-06": { "/posts/a/": 2, "/posts/b/": 4 },
  "2026-10-08": { "/posts/a/": 4, "/posts/b/": 1, "/posts/existing-post/": 2 },
};

describe("博客：导入已有文章 → 拉数据 → 再拉", () => {
  it("导入后第一次拉补历史，累计和每天新增都对；再拉一次已是最新", async () => {
    const fixture = await makeBlogFixture();
    const fake = new FakeUmami(TRAFFIC);
    const app = openApp({
      home: join(fixture.base, "app-home"),
      now: () => new Date(NOW),
      fetch: fake.fetch,
      platforms: runtime(),
    });
    try {
      await fixture.pushFromElsewhere(
        {
          "content/posts/zh/a.mdx": post("文章 A", "2026-10-04"),
          "content/posts/zh/b.mdx": post("文章 B", "2026-10-06"),
          // 一直没人看的文章
          "content/posts/zh/c.mdx": post("文章 C", "2026-10-07"),
        },
        "Notion 同步",
      );
      const authorBefore = await fixture.snapshotAuthor();
      const usecases = createUseCases(app);
      const account = usecases.addAccount({
        platform: "blog",
        name: "测试博客",
        intro: "账号档案",
        settings: {
          "repo-path": fixture.repo,
          "site-url": "https://blog.example.test",
          "umami-share": SHARE_URL,
        },
      });

      // 1. 导入：线上的文章都建成已完成作品，原稿位置指向作者仓库里的路径
      const imported = await usecases.importPosts(account.id);
      expect(imported).toMatchObject({
        added: 4,
        skipped: 0,
        drafts: 0,
        issues: [],
      });
      const bySource = new Map(
        imported.works.map((work) => [work.sourceRef, work]),
      );
      const a = bySource.get("zh/a");
      const b = bySource.get("zh/b");
      const existing = bySource.get("zh/existing-post");
      const unseen = bySource.get("zh/c");
      if (!a || !b || !existing || !unseen) throw new Error("导入的作品不全");
      expect(a).toMatchObject({
        status: "done",
        url: "https://blog.example.test/posts/a/",
        publishedAt: "2026-10-04",
        localPath: join(fixture.repo, "content", "posts", "zh", "a.mdx"),
      });
      expect(
        await exists(join(app.paths.home, "blog-checkout", account.id)),
      ).toBe(true);

      // 再导入一次：都已经有了，全部跳过
      expect(await usecases.importPosts(account.id)).toMatchObject({
        added: 0,
        skipped: 4,
      });

      // 2. 第一次拉：补历史，从全站第一天有数据的 10-05 到昨天 10-08
      const first = await usecases.pullData();
      expect(first.outcomes).toEqual([{ accountId: account.id, status: "ok" }]);
      expect(first.note).toBe("全部入库");
      const works = new Map(
        usecases.listWorks().map((work) => [work.id, work]),
      );
      expect(works.get(a.id)).toMatchObject({
        totals: { pageviews: 9, visitors: 9 },
        totalsDay: "2026-10-08",
      });
      expect(works.get(b.id)).toMatchObject({
        totals: { pageviews: 5, visitors: 5 },
        totalsDay: "2026-10-08",
      });
      expect(works.get(existing.id)).toMatchObject({
        totals: { pageviews: 3, visitors: 3 },
      });
      // 一直没人看的文章记了一条昨天的 0，有了累计数据
      expect(works.get(unseen.id)).toMatchObject({
        totals: { pageviews: 0, visitors: 0 },
        totalsDay: "2026-10-08",
      });

      // 每天新增（共享规则从快照算出来）：第一次非零的前一天有全 0 快照，所以第一天的访问也算进当天的新增
      const dataset = usecases.dataset();
      expect(dataset.latestDay).toBe("2026-10-08");
      expect(
        dataset.workDays[a.id]?.map((day) => [day.day, day.reads]),
      ).toEqual([
        ["2026-10-05", 3],
        ["2026-10-06", 2],
        ["2026-10-08", 4],
      ]);
      expect(
        dataset.workDays[b.id]?.map((day) => [day.day, day.reads]),
      ).toEqual([
        ["2026-10-06", 4],
        ["2026-10-08", 1],
      ]);
      // 发布日期（10-08）比数据开始的日子还晚的老文章：靠起点前一天的全 0 快照，10-05 那一次访问才算进当天
      expect(
        dataset.workDays[existing.id]?.map((day) => [day.day, day.reads]),
      ).toEqual([
        ["2026-10-05", 1],
        ["2026-10-08", 2],
      ]);
      expect(dataset.workDays[unseen.id]).toBeUndefined();
      // 账号每天：全站当天的访问（含首页），一天不缺
      const daily = dataset.daily[account.id] ?? [];
      expect(daily.map((point) => [point.day, point.reads])).toEqual([
        ["2026-10-05", 6],
        ["2026-10-06", 6],
        ["2026-10-07", 0],
        ["2026-10-08", 7],
      ]);

      // 3. 再拉一次：上次已经拉到昨天，什么都不用做，也不发请求
      const requestsBefore = fake.requests.length;
      const second = await usecases.pullData();
      expect(second.outcomes).toEqual([
        { accountId: account.id, status: "ok" },
      ]);
      expect(fake.requests.length).toBe(requestsBefore);

      // 4. 第二天又来拉：只补昨天一天（取令牌、日序列、全量累计，3 次请求）；
      //    没人看的文章已经有累计数据，不会再让每次拉取退回补历史
      app.now = () => new Date("2026-10-10T09:00:00+08:00");
      fake.traffic["2026-10-09"] = { "/posts/a/": 5, "/posts/b/": 2 };
      const requestsAfterFirstDay = fake.requests.length;
      await usecases.pullData();
      expect(fake.requests.length - requestsAfterFirstDay).toBe(3);
      const next = new Map(usecases.listWorks().map((work) => [work.id, work]));
      expect(next.get(a.id)).toMatchObject({
        totals: { pageviews: 14, visitors: 14 },
        totalsDay: "2026-10-09",
      });
      const nextDataset = usecases.dataset();
      expect(
        nextDataset.workDays[a.id]?.map((day) => [day.day, day.reads]),
      ).toEqual([
        ["2026-10-05", 3],
        ["2026-10-06", 2],
        ["2026-10-08", 4],
        ["2026-10-09", 5],
      ]);

      // 5. 又过一天，昨天（10-10）发了一篇新文章：导入进来，下一次拉只补它发布前一天到昨天的两天，不用补满半年
      await fixture.pushFromElsewhere(
        { "content/posts/zh/d.mdx": post("文章 D", "2026-10-10") },
        "又发一篇",
      );
      app.now = () => new Date("2026-10-11T09:00:00+08:00");
      fake.traffic["2026-10-10"] = { "/posts/d/": 3, "/posts/a/": 1 };
      const again = await usecases.importPosts(account.id);
      expect(again).toMatchObject({ added: 1, skipped: 4 });
      const fresh = again.works[0];
      if (!fresh) throw new Error("新文章没导入");
      const requestsBeforeNew = fake.requests.length;
      await usecases.pullData();
      // 取令牌、日序列、全量累计，加 10-10 一天的单日请求
      expect(fake.requests.length - requestsBeforeNew).toBe(4);
      expect(
        usecases.listWorks().find((work) => work.id === fresh.id),
      ).toMatchObject({
        totals: { pageviews: 3, visitors: 3 },
        totalsDay: "2026-10-10",
      });
      expect(
        usecases
          .dataset()
          .workDays[fresh.id]?.map((day) => [day.day, day.reads]),
      ).toEqual([["2026-10-10", 3]]);

      // 作者的博客工作区从头到尾一个字节不动
      expect(await fixture.snapshotAuthor()).toEqual(authorBefore);
    } finally {
      closeApp(app);
      await fixture.close();
    }
  }, 180_000);
});
