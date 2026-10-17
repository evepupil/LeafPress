/**
 * M3 知乎端到端（模块设计 · 平台适配-知乎「验证方式」第 7 条）：
 * 真实的用例层 + 真实的平台登记表，只有知乎开放平台接口是假的（openApp 注入假 fetch）。
 *
 * 顺序跑一遍：导入 → 拉数据 → 再拉一次（已是最新）→ 博客作品转知乎 → 生成复制页 →
 * 反馈里贴链接 → 归档 → 回答问题 → 读复制页文件。各阶段一个 it，共享一个环境，
 * 失败时能定位到阶段。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACCESS_SECRET,
  PNG_DATA_URL,
  YESTERDAY,
  SITE_URL,
  makeBlogRepo,
  insertPublishedBlogWork,
  REWRITE_DRAFT,
  openM3Environment,
  type M3Environment,
} from "./m3-zhihu-env.js";
import {
  ANSWER_URL,
  ARTICLE_URL,
  makeM3Api,
  statsRow,
  type FakeZhihuApi,
} from "./m3-zhihu-api.js";

describe("M3 知乎端到端", () => {
  let environment: M3Environment | undefined;
  let api: FakeZhihuApi | undefined;

  /** 阶段间传递的编号（按创建顺序拿，不硬编码） */
  let zhihuAccountId = "";
  let articleWorkId = "";
  let answerWorkId = "";
  let zhihuFromBlogId = "";

  beforeAll(async () => {
    api = makeM3Api();
    environment = await openM3Environment(api.fetch);
  });

  afterAll(async () => {
    if (environment) {
      await environment.close();
      environment = undefined;
    }
  });

  function mustEnv(): M3Environment {
    if (!environment) throw new Error("环境没建好");
    return environment;
  }

  it("第 1 步 导入：两页内容只导文章和回答，链接规范化、sourceRef 正确", async () => {
    const { usecases } = mustEnv();
    const account = usecases.addAccount({
      platform: "zhihu",
      name: "知乎号",
      intro: "",
    });
    usecases.setSetting(account.id, "access-secret", ACCESS_SECRET);

    const summary = await usecases.importPosts(account.id);

    expect(summary.added).toBe(2);
    const works = summary.works;
    expect(works.map((work) => work.sourceRef)).toEqual([
      "zhihu/article/100001",
      "zhihu/answer/900001",
    ]);
    expect(works.map((work) => work.url)).toEqual([ARTICLE_URL, ANSWER_URL]);
    expect(works.map((work) => work.publishedAt)).toEqual([
      "2026-09-05",
      "2026-09-10",
    ]);
    // 知乎账号（后面阶段都用它）
    zhihuAccountId = account.id;
    articleWorkId = works[0]?.id ?? "";
    answerWorkId = works[1]?.id ?? "";
  }, 20_000);

  it("第 2 步 拉数据：账号关注者记在昨天，两篇的昨天快照有浏览点赞；再拉一次已是最新、不再发请求", async () => {
    const { usecases, app } = mustEnv();
    if (!api) throw new Error("环境没建好");

    const first = await usecases.pullData({ accountIds: [zhihuAccountId] });
    expect(first.outcomes).toEqual([
      { accountId: zhihuAccountId, status: "ok" },
    ]);
    // 导入 2 页 + 查额度 1 + 账号 1 + 两篇各 1（不带日期，没有逐日补历史）
    expect(api.count).toBe(6);

    // 账号一行：昨天收盘的关注者数
    expect(app.store.snapshots.accountDays(YESTERDAY, YESTERDAY)).toEqual([
      {
        accountId: zhihuAccountId,
        day: YESTERDAY,
        followers: 3210,
        reads: 888,
        interactions: null,
      },
    ]);
    // 两篇作品的昨天快照（累计减掉 Today；Yesterday 里的数只在第一次拉时用来补前天）
    // 第一次拉多写一条前天（再减 Yesterday）：文章 120−0=120、再减昨天 20 得前天 100
    const snapshots = app.store.snapshots.workSnapshots(
      "2026-10-06",
      YESTERDAY,
    );
    const byWork = new Map(snapshots.map((row) => [row.workId, row]));
    expect(byWork.get(answerWorkId)?.totals).toEqual({
      views: 45,
      likes: 11,
      comments: 3,
    });
    expect(byWork.get(articleWorkId)?.totals).toEqual({
      views: 120,
      likes: 30,
      collects: 4,
      comments: 2,
      shares: 1,
    });

    // 数据页：昨天的关注者数
    const dataset = usecases.dataset();
    const point = dataset.daily[zhihuAccountId]?.find(
      (item) => item.day === YESTERDAY,
    );
    expect(point?.followers).toBe(3210);

    // 再拉一次：已是最新，不再发请求
    const before = api.count;
    const second = await usecases.pullData({ accountIds: [zhihuAccountId] });
    expect(second.outcomes).toEqual([
      { accountId: zhihuAccountId, status: "ok" },
    ]);
    expect(api.count).toBe(before);
    const latest = app.store.pulls
      .latest()
      .find((record) => record.accountId === zhihuAccountId);
    expect(latest?.status).toBe("ok");
    expect(latest?.note).toContain("已经拉过");
  }, 20_000);

  it("第 3 步 博客改写：配 zhihu-from-blog，AI 步骤换成测试写文件，复制页生成后停在等你发布", async () => {
    const { usecases, app, home } = mustEnv();
    // 博客账号（仓库位置、站点地址都指向临时目录里造的假仓库）
    const blog = usecases.addAccount({
      platform: "blog",
      name: "博客号",
      intro: "",
      settings: {
        "repo-path": join(home, "blog-repo"),
        "site-url": SITE_URL,
      },
    });
    const localPath = await makeBlogRepo(home);
    const blogWorkId = insertPublishedBlogWork(
      app,
      blog.id,
      localPath,
      SITE_URL,
    );

    // 转成知乎作品：自动配「博客改写」
    const [converted] = usecases.createWorks({
      source: { kind: "work", workId: blogWorkId },
      accountIds: [zhihuAccountId],
      brief: "照知乎的写法改写",
    });
    if (!converted) throw new Error("没转出知乎作品");
    expect(converted.workflowId).toBe("zhihu-from-blog");
    zhihuFromBlogId = converted.id;

    // 接手第 1 步（AI：改写成知乎文章），测试代替 AI 写文章.md
    const started = usecases.startWork({ id: converted.id });
    const token = started.lease?.token;
    if (!token) throw new Error("改写步骤没发令牌");
    await writeFile(
      join(started.detail.folder, "文章.md"),
      REWRITE_DRAFT,
      "utf8",
    );
    const stepped = usecases.stepWork(converted.id, token);
    expect(stepped.message).toContain("下一步：生成复制页");

    // 跑代码步骤：生成复制页
    const run = await usecases.runWork(converted.id, token);
    expect(run.outcome).toMatchObject({
      kind: "done",
      note: "复制页已生成：2 张图",
    });
    const page = await readFile(
      join(started.detail.folder, "知乎发布稿.html"),
      "utf8",
    );
    expect(page).toContain(`src="${PNG_DATA_URL}"`);
    expect(page).toContain(`href="${SITE_URL}/posts/demo/"`);
    expect(page).toContain(`首发于个人博客：<a href="${SITE_URL}/posts/demo/"`);
    expect((page.match(/<figure class="fig"/g) ?? []).length).toBe(2);
    // 停在等你处理（你去发布）
    expect(run.detail.work.status).toBe("waiting");
    expect(run.message).toContain("你去发布");
    // 复制页文件在任务文件夹名单里，能读出 HTML 类型
    expect(usecases.showWork(converted.id).files).toContain("知乎发布稿.html");
    const file = usecases.readWorkFile(converted.id, "知乎发布稿.html");
    expect(file.contentType).toBe("text/html; charset=utf-8");
  }, 20_000);

  it("第 4 步 归档：反馈里贴带查询串的文章链接，归档后 url 规范化、sourceRef 对上", async () => {
    const { usecases } = mustEnv();
    const feedback = usecases.submitFeedback(
      zhihuFromBlogId,
      "发了：https://zhuanlan.zhihu.com/p/123456?utm=x",
    );
    expect(feedback.status).toBe("todo");

    const restarted = usecases.startWork({ id: zhihuFromBlogId });
    const token = restarted.lease?.token;
    if (!token) throw new Error("归档步骤没发令牌");
    expect(restarted.message).toContain("接着做：归档链接");

    const finished = await usecases.runWork(zhihuFromBlogId, token);
    expect(finished.outcome).toMatchObject({
      kind: "done",
      url: "https://zhuanlan.zhihu.com/p/123456",
      sourceRef: "zhihu/article/123456",
    });
    const done = finished.detail.work;
    expect(done.status).toBe("done");
    expect(done.url).toBe("https://zhuanlan.zhihu.com/p/123456");
    expect(done.sourceRef).toBe("zhihu/article/123456");
    expect(done.publishedAt).toBe("2026-10-08");
  }, 20_000);

  it("第 5 步 回答问题：带问题链接的灵感转知乎作品配 zhihu-answer，第 2 步停在确认提纲", async () => {
    const { usecases } = mustEnv();
    const [idea] = usecases.addIdeas([
      { text: "想回答的问题", detail: "", source: "quick" },
    ]);
    if (!idea) throw new Error("没建出灵感");
    const [converted] = usecases.createWorks({
      source: { kind: "idea", ideaId: idea.id },
      accountIds: [zhihuAccountId],
      brief: "回答这个问题 https://www.zhihu.com/question/42 说清楚前后经过",
    });
    if (!converted) throw new Error("没转出回答作品");
    expect(converted.workflowId).toBe("zhihu-answer");

    const started = usecases.startWork({ id: converted.id });
    const token = started.lease?.token;
    if (!token) throw new Error("出提纲步骤没发令牌");
    await writeFile(
      join(started.detail.folder, "提纲.md"),
      "# 问题标题\n\nhttps://www.zhihu.com/question/42\n\n1. 经过\n",
      "utf8",
    );
    const stepped = usecases.stepWork(converted.id, token);
    // 第 2 步是 manual（你确认提纲），停在等你处理
    expect(stepped.detail.work.status).toBe("waiting");
    expect(stepped.message).toContain("你确认提纲");
  }, 20_000);

  it("第 6 步 归档后再拉：同一天已是最新不发请求；到明天新归档的文章也拿到数", async () => {
    const environmentHere = mustEnv();
    const { usecases, app } = environmentHere;
    if (!api) throw new Error("环境没建好");

    // 同一天再拉：一天只拉一次，新归档的文章也等明天
    const sameDay = api.count;
    const result = await usecases.pullData({ accountIds: [zhihuAccountId] });
    expect(result.outcomes).toEqual([
      { accountId: zhihuAccountId, status: "ok" },
    ]);
    expect(api.count).toBe(sameDay);

    // 给新归档的文章也放好数（不带日期：累计嵌 Today、Yesterday），时钟推到第二天
    const NEW_URL = "https://zhuanlan.zhihu.com/p/123456";
    api.setContentStats(NEW_URL, [
      statsRow(NEW_URL, "123456", { ViewCount: 77, UpvoteCount: 8 }),
    ]);
    environmentHere.setNow(new Date("2026-10-09T09:00:00+08:00"));

    const nextDay = await usecases.pullData({ accountIds: [zhihuAccountId] });
    expect(nextDay.outcomes).toEqual([
      { accountId: zhihuAccountId, status: "ok" },
    ]);
    // 查额度 1 + 账号 1 + 三篇各 1（不带日期；旧两篇已有快照不补前天，新归档的没有 Today/Yesterday）
    expect(api.count - sameDay).toBe(5);

    const rows = app.store.snapshots.workSnapshots("2026-10-08", "2026-10-08");
    const archived = rows.find((row) => row.workId === zhihuFromBlogId);
    expect(archived?.totals).toEqual({ views: 77, likes: 8 });
  }, 20_000);
});
