import {
  followupKey,
  questionKey,
  type IdeaCandidate,
  type QuestionVia,
} from "@leafpress/core";
import { describe, expect, it } from "vitest";
import type {
  FoundQuestion,
  QuestionFinder,
  QuestionFinderContext,
  QuestionFinderOutcome,
  QuestionFinderStage,
} from "../../src/platforms/types.js";
import type { DevActivity } from "../../src/ideas/types.js";
import { addAccount, createWork, withUseCases } from "./helpers.js";
import { resolveDevRoots } from "../../src/usecases/ideas-gather-devlog.js";
import type { AppContext } from "../../src/usecases/context.js";

const STAGES: QuestionFinderStage["stage"][] = [
  "personal",
  "topic",
  "blog",
  "hot",
];

function question(
  questionId: string,
  title: string,
  via: QuestionVia[] = ["personal"],
  options: Partial<
    Pick<FoundQuestion, "topics" | "blogWorkIds" | "answerSummaries">
  > = {},
): FoundQuestion {
  return {
    questionId,
    title,
    url: `https://www.zhihu.com/question/${questionId}`,
    via,
    topics: options.topics ?? [],
    blogWorkIds: options.blogWorkIds ?? [],
    answerSummaries: options.answerSummaries ?? [],
  };
}

function successful(
  questions: FoundQuestion[],
  counts: Partial<Record<QuestionFinderStage["stage"], number>> = {},
  warnings: Partial<Record<QuestionFinderStage["stage"], string>> = {},
): QuestionFinderOutcome {
  return {
    ok: true,
    questions,
    stages: STAGES.map((stage) => {
      const warning = warnings[stage];
      return {
        stage,
        found: counts[stage] ?? 0,
        ...(warning === undefined ? {} : { warning }),
      };
    }),
  };
}

function finder(
  run: (ctx: QuestionFinderContext) => Promise<QuestionFinderOutcome>,
  summarize: QuestionFinder["summarize"] = () =>
    Promise.resolve({
      ok: true,
      summaries: new Map(),
    }),
): QuestionFinder {
  return { find: run, summarize };
}

function publishWork(
  app: AppContext,
  work: ReturnType<typeof createWork>,
  input: {
    url?: string;
    publishedAt?: string;
    totals?: Record<string, number>;
    status?: "done" | "waiting";
    brief?: string;
  } = {},
) {
  const published = {
    ...work,
    status: input.status ?? "done",
    ...(input.url === undefined ? {} : { url: input.url }),
    ...(input.publishedAt === undefined
      ? {}
      : { publishedAt: input.publishedAt }),
    ...(input.totals === undefined ? {} : { totals: input.totals }),
    ...(input.brief === undefined ? {} : { brief: input.brief }),
  } as const;
  app.store.transaction(() => app.store.works.update(published));
  return published;
}

function insertRejectedQuestion(
  app: AppContext,
  accountId: string,
  questionId: string,
  at: string,
): void {
  const candidate: IdeaCandidate = {
    id: "c-900",
    key: questionKey(questionId),
    kind: "question",
    title: "不要再推",
    url: `https://www.zhihu.com/question/${questionId}`,
    accountId,
    score: 10,
    state: "rejected",
    payload: {
      kind: "question",
      questionId,
      via: ["personal"],
      topics: [],
      blogWorkIds: [],
      answerSummaries: [],
      relatedWorkIds: [],
    },
    firstSeenAt: at,
    updatedAt: at,
  };
  app.store.transaction(() => app.store.candidates.insert(candidate));
}

const DEV_ACTIVITY: DevActivity = {
  repo: "demo",
  path: "C:/projects/demo",
  commits: ["完成采集器"],
  logs: [{ file: "docs/进度/2026-10-08.md", headings: ["完成调度"] }],
};

describe("业务用例：跑灵感", () => {
  it("开发根目录优先使用配置，Windows 默认路径存在性可注入", async () => {
    expect(resolveDevRoots(["C:/configured"], "win32", () => false)).toEqual([
      "C:/configured",
    ]);
    expect(
      resolveDevRoots(undefined, "win32", (path) => path === "C:\\code"),
    ).toEqual(["C:\\code"]);
    expect(resolveDevRoots(undefined, "win32", () => false)).toEqual([]);
    expect(resolveDevRoots(undefined, "linux", () => true)).toEqual([]);

    let receivedRoots: readonly string[] | undefined;
    await withUseCases(
      async ({ app, usecases }) => {
        app.config.ideas.devRoots = ["C:/configured"];
        app.devRoots = undefined;
        await usecases.gatherIdeas();
      },
      {
        readDevActivity: (input) => {
          receivedRoots = input.roots;
          return Promise.resolve([]);
        },
      },
    );
    expect(receivedRoots).toEqual(["C:/configured"]);
  });

  it("汇总四类来源、合并问题并记录跳过集合、关联作品和博客探测时间", async () => {
    let finderContext: QuestionFinderContext | undefined;
    let summaryQuestionIds: string[] = [];
    const finderImpl = finder(
      (ctx) => {
        finderContext = ctx;
        return Promise.resolve(
          successful(
            [
              question("123", "TypeScript 发布流程", ["personal"]),
              question("123", "TypeScript 发布流程", ["topic", "blog"], {
                topics: ["TypeScript"],
                blogWorkIds: ["b-1"],
              }),
              question("222", "如何做热榜", ["hot"], {
                topics: ["TypeScript"],
              }),
              question("555", "已有知乎问题", ["personal"]),
              question("666", "已有灵感问题", ["personal"]),
              question("777", "博客说明里的问题", ["personal"]),
              question("888", "不要再推", ["personal"]),
              question("999", "作者已答过", ["personal"]),
            ],
            { personal: 6, topic: 1, blog: 1, hot: 1 },
          ),
        );
      },
      (_ctx, questions) => {
        summaryQuestionIds = questions.map((item) => item.questionId);
        return Promise.resolve({
          ok: true,
          summaries: new Map([
            ["123", ["摘要 123"]],
            ["222", ["摘要 222"]],
          ]),
        });
      },
    );
    let readArgs: { roots: readonly string[]; since: string } | undefined;
    await withUseCases(
      async ({ usecases, app }) => {
        const zhihu = addAccount(usecases, "知乎号", "zhihu", {
          "access-secret": "test-secret",
        });
        const blog = addAccount(usecases, "博客号", "blog");
        const blogWork = publishWork(
          app,
          createWork(usecases, blog.id, "TypeScript 发布流程"),
          {
            url: "https://blog.example/typescript-release",
            publishedAt: "2026-09-20",
            totals: { pageviews: 800 },
            brief: "参考 https://www.zhihu.com/question/777/answer/1",
          },
        );
        app.store.transaction(() => {
          app.store.snapshots.putWorkSnapshot({
            workId: blogWork.id,
            day: "2026-10-01",
            totals: { pageviews: 700 },
          });
          app.store.snapshots.putWorkSnapshot({
            workId: blogWork.id,
            day: "2026-10-07",
            totals: { pageviews: 800 },
          });
        });
        const answerWork = publishWork(
          app,
          createWork(usecases, zhihu.id, "作者已答过"),
          { url: "https://www.zhihu.com/answer/12", status: "waiting" },
        );
        publishWork(app, createWork(usecases, zhihu.id, "已经有问题链接"), {
          url: "https://www.zhihu.com/question/555/answer/13",
          status: "waiting",
        });
        usecases.addIdeas([
          {
            text: "旧灵感",
            source: "quick",
            sourceDetail: "参考 https://www.zhihu.com/question/666",
          },
        ]);
        insertRejectedQuestion(
          app,
          zhihu.id,
          "888",
          "2026-10-08T09:00:00+08:00",
        );
        expect(answerWork.id).not.toBe(blogWork.id);

        const report = await usecases.gatherIdeas({
          topics: [" TypeScript ", "TypeScript"],
        });

        expect(finderContext?.account.id).toBe(zhihu.id);
        expect(finderContext?.topics).toEqual(["TypeScript"]);
        expect(finderContext?.blogs).toEqual([
          { workId: blogWork.id, title: "TypeScript 发布流程" },
        ]);
        expect(summaryQuestionIds).toEqual(["123", "222"]);
        expect(finderContext?.skipQuestionIds).toEqual(
          new Set(["555", "666", "777", "888"]),
        );
        expect(report.sources.map((source) => source.name)).toEqual([
          "知乎个性化推荐",
          "知乎主题推荐",
          "博客反找问题",
          "知乎热榜",
          "补回答摘要",
          "已发作品",
          "开发记录",
        ]);
        expect(report.sources).toMatchObject([
          { name: "知乎个性化推荐", found: 6, added: 1 },
          { name: "知乎主题推荐", found: 1, added: 1 },
          { name: "博客反找问题", found: 1, added: 1 },
          { name: "知乎热榜", found: 1, added: 1 },
          { name: "补回答摘要", found: 2, added: 0 },
          { name: "已发作品", found: 1, added: 1 },
          { name: "开发记录", found: 1, added: 1 },
        ]);
        const mergedQuestion = report.pool.find(
          (candidate) => candidate.key === questionKey("123"),
        );
        expect(mergedQuestion).toMatchObject({
          kind: "question",
          title: "TypeScript 发布流程",
          accountId: zhihu.id,
          payload: {
            questionId: "123",
            via: ["personal", "topic", "blog"],
            topics: ["TypeScript"],
            blogWorkIds: [blogWork.id],
            relatedWorkIds: [blogWork.id],
            answerSummaries: ["摘要 123"],
          },
        });
        expect(
          report.pool.some((candidate) => candidate.key === questionKey("999")),
        ).toBe(false);
        expect(app.store.probes.get(`blog:${blogWork.id}`)).toBe(
          "2026-10-08T09:00:00+08:00",
        );
      },
      {
        questionFinder: finderImpl,
        readDevActivity: (input) => {
          readArgs = { roots: input.roots, since: input.since };
          return Promise.resolve([DEV_ACTIVITY]);
        },
        devRoots: ["C:/projects"],
      },
    );
    expect(readArgs).toEqual({ roots: ["C:/projects"], since: "2026-10-02" });
  });

  it("按发布日期挑三篇博客，反找成功后冷却 30 天再选", async () => {
    const seenBlogs: string[][] = [];
    const questionFinder = finder((ctx) => {
      seenBlogs.push(ctx.blogs.map((blog) => blog.workId));
      return Promise.resolve(successful([], { blog: ctx.blogs.length }));
    });
    await withUseCases(
      async ({ usecases, app, clock }) => {
        addAccount(usecases, "知乎号", "zhihu");
        const blogAccount = addAccount(usecases, "博客号", "blog");
        const works = [
          ["较早", "2026-09-20"],
          ["次早", "2026-09-21"],
          ["次新", "2026-09-22"],
          ["最新", "2026-09-23"],
        ].map(([title, publishedAt]) =>
          publishWork(
            app,
            createWork(usecases, blogAccount.id, title ?? "无标题"),
            {
              url: `https://blog.example/${title}`,
              publishedAt,
              totals: { pageviews: 100 },
            },
          ),
        );

        const latestBlog = works[3];
        if (!latestBlog) throw new Error("缺少最新博客作品");
        app.store.probes.set(
          `blog:${latestBlog.id}`,
          "2026-09-07T09:00:00+08:00",
        );

        await usecases.gatherIdeas();
        expect(seenBlogs[0]).toEqual(
          works
            .slice(0, 3)
            .reverse()
            .map((work) => work.id),
        );
        await usecases.gatherIdeas();
        expect(seenBlogs[1]).toEqual([latestBlog.id]);
        clock.set(new Date("2026-11-07T09:00:00+08:00"));
        await usecases.gatherIdeas();
        expect(seenBlogs[2]).toEqual(
          works
            .slice(1)
            .reverse()
            .map((work) => work.id),
        );
      },
      { questionFinder },
    );
  });

  it("博客反找阶段带 warning 时不写探测记录", async () => {
    const questionFinder = finder((ctx) =>
      Promise.resolve(
        successful(
          [],
          { blog: ctx.blogs.length },
          { blog: "博客反找暂时失败" },
        ),
      ),
    );
    await withUseCases(
      async ({ usecases, app }) => {
        addAccount(usecases, "知乎号", "zhihu");
        const blog = addAccount(usecases, "博客号", "blog");
        const work = publishWork(
          app,
          createWork(usecases, blog.id, "待反找的博客"),
          {
            url: "https://blog.example/unprobed",
            publishedAt: "2026-09-20",
            totals: { pageviews: 100 },
          },
        );

        const report = await usecases.gatherIdeas();

        expect(
          report.sources.find((source) => source.name === "博客反找问题"),
        ).toMatchObject({ found: 1, warning: "博客反找暂时失败" });
        expect(app.store.probes.get(`blog:${work.id}`)).toBeUndefined();
      },
      { questionFinder },
    );
  });

  it("续写只选近七天增长为正的前三篇，并保留完整续写 payload", async () => {
    const questionFinder = finder(() => Promise.resolve(successful([])));
    await withUseCases(
      async ({ usecases, app }) => {
        addAccount(usecases, "知乎号", "zhihu");
        const blog = addAccount(usecases, "博客号", "blog");
        const growths = [120, 100, 90, 80, 0];
        const works = growths.map((growth, index) =>
          publishWork(
            app,
            createWork(usecases, blog.id, `增长文章 ${index + 1}`),
            {
              url: `https://blog.example/growth-${index + 1}`,
              publishedAt: "2026-09-20",
              totals: { pageviews: 1000, visitors: 500 },
            },
          ),
        );
        app.store.transaction(() => {
          works.forEach((work, index) => {
            const growth = growths[index];
            if (growth === undefined) throw new Error("缺少快照增长值");
            app.store.snapshots.putWorkSnapshot({
              workId: work.id,
              day: "2026-10-01",
              totals: { pageviews: 1000, visitors: 500 },
            });
            app.store.snapshots.putWorkSnapshot({
              workId: work.id,
              day: "2026-10-07",
              totals: {
                pageviews: 1000 + growth,
                visitors: 500 + Math.floor(growth / 2),
              },
            });
          });
        });

        const report = await usecases.gatherIdeas();
        const followups = report.pool.filter(
          (candidate) => candidate.kind === "followup",
        );
        expect(followups).toHaveLength(3);
        expect(followups.map((candidate) => candidate.key).sort()).toEqual(
          works
            .slice(0, 3)
            .map((work) => followupKey(work.id))
            .sort(),
        );
        expect(
          report.pool.some(
            (candidate) => candidate.key === followupKey(works[4]!.id),
          ),
        ).toBe(false);
        expect(
          report.pool.find(
            (candidate) => candidate.key === followupKey(works[0]!.id),
          ),
        ).toMatchObject({
          kind: "followup",
          url: "https://blog.example/growth-1",
          payload: {
            kind: "followup",
            workId: works[0]!.id,
            platform: "blog",
            publishedAt: "2026-09-20",
            reach: 1120,
            growth: 120,
            interactions: null,
          },
        });
        expect(
          report.sources.find((source) => source.name === "已发作品"),
        ).toMatchObject({ found: 3, added: 3 });
      },
      { questionFinder },
    );
  });

  it("刷新问题候选整体替换本轮 payload，仅在缺少回答摘要时沿用旧值", async () => {
    let currentTitle = "第一次标题";
    let currentVia: QuestionVia[] = ["personal"];
    let currentTopics = ["上轮主题"];
    let currentBlogWorkIds = ["old-blog"];
    let currentAnswerSummaries = ["上一轮回答摘要"];
    const questionFinder = finder(() =>
      Promise.resolve(
        successful([
          question("321", currentTitle, currentVia, {
            topics: currentTopics,
            blogWorkIds: currentBlogWorkIds,
            answerSummaries: currentAnswerSummaries,
          }),
        ]),
      ),
    );
    await withUseCases(
      async ({ usecases, clock }) => {
        addAccount(usecases, "知乎号", "zhihu");
        const first = await usecases.gatherIdeas();
        const candidate = first.pool.find(
          (item) => item.key === questionKey("321"),
        );
        expect(candidate).toBeDefined();
        if (!candidate) throw new Error("没有问题候选");
        const firstSeenAt = candidate.firstSeenAt;

        currentTitle = "刷新后的标题";
        currentVia = ["topic"];
        currentTopics = ["本轮主题"];
        currentBlogWorkIds = ["current-blog"];
        currentAnswerSummaries = [];
        const refreshed = await usecases.gatherIdeas({
          topics: ["TypeScript"],
        });
        expect(refreshed.pool).toHaveLength(1);
        expect(refreshed.pool[0]).toMatchObject({
          id: candidate.id,
          title: "刷新后的标题",
          firstSeenAt,
          payload: {
            via: ["topic"],
            topics: ["本轮主题"],
            blogWorkIds: ["current-blog"],
            answerSummaries: ["上一轮回答摘要"],
          },
        });

        usecases.skipCandidates([candidate.id]);
        await usecases.gatherIdeas({ topics: ["TypeScript"] });
        expect(usecases.listCandidates()).toEqual([]);
        clock.set(new Date("2026-10-22T09:00:00+08:00"));
        const afterCooldown = await usecases.gatherIdeas({
          topics: ["TypeScript"],
        });
        expect(afterCooldown.pool).toHaveLength(1);
        expect(afterCooldown.pool[0]).toMatchObject({
          id: candidate.id,
          state: "new",
          title: "刷新后的标题",
        });
      },
      { questionFinder },
    );
  });

  it("候选整批校验、继承账号和来源，并在灵感删除时标成 rejected", async () => {
    const questionFinder = finder(() =>
      Promise.resolve(
        successful([
          question("401", "待推候选"),
          question("402", "另一个候选"),
        ]),
      ),
    );
    await withUseCases(
      ({ usecases, app }) => {
        const zhihu = addAccount(usecases, "知乎号", "zhihu");
        const reportPromise = usecases.gatherIdeas();
        return reportPromise.then((report) => {
          const first = report.pool.find(
            (item) => item.key === questionKey("401"),
          );
          const second = report.pool.find(
            (item) => item.key === questionKey("402"),
          );
          if (!first || !second) throw new Error("候选没有入池");
          expect(() =>
            usecases.addIdeas([
              { text: "重复候选一", source: "schedule", candidateId: first.id },
              { text: "重复候选二", source: "schedule", candidateId: first.id },
            ]),
          ).toThrowError(/在本批里重复/);
          expect(usecases.listIdeas()).toEqual([]);
          expect(app.store.candidates.get(first.id)?.state).toBe("new");
          expect(() =>
            usecases.addIdeas([
              { text: "不应新增", source: "schedule", candidateId: first.id },
              { text: "编号不存在", source: "schedule", candidateId: "c-9999" },
            ]),
          ).toThrowError(/候选 c-9999 不存在/);
          expect(usecases.listIdeas()).toEqual([]);
          expect(app.store.candidates.get(first.id)?.state).toBe("new");

          const [idea] = usecases.addIdeas([
            { text: "待推候选", source: "schedule", candidateId: first.id },
          ]);
          if (!idea) throw new Error("灵感没有创建");
          expect(idea).toMatchObject({
            accountId: zhihu.id,
            sourceDetail: "https://www.zhihu.com/question/401",
          });
          expect(app.store.candidates.get(first.id)).toMatchObject({
            state: "suggested",
            ideaId: idea.id,
          });
          usecases.deleteIdea(idea.id);
          expect(app.store.candidates.get(first.id)).toMatchObject({
            state: "rejected",
            ideaId: idea.id,
          });
          expect(() =>
            usecases.addIdeas([
              { text: "不能再推", source: "schedule", candidateId: first.id },
            ]),
          ).toThrowError(/候选 c-1 已标为不要/);
          expect(() =>
            usecases.skipCandidates([second.id, second.id]),
          ).toThrowError(/候选编号不能重复/);
          expect(() =>
            usecases.skipCandidates([second.id, "c-9999"]),
          ).toThrowError(/候选 c-9999 不在池里/);
          expect(app.store.candidates.get(second.id)?.state).toBe("new");
          const skipped = usecases.skipCandidates("rest");
          expect(skipped.map((item) => item.id)).toEqual([second.id]);
          expect(usecases.listCandidates()).toEqual([]);
          expect(usecases.listCandidates({ state: ["skipped"] })).toEqual(
            skipped,
          );
          expect(
            usecases.listCandidates({ state: ["rejected"] }),
          ).toMatchObject([{ id: first.id, state: "rejected" }]);
        });
      },
      { questionFinder },
    );
  });

  it("池满时直接删除溢出项，主题过多报 USAGE，空主题写来源警告", async () => {
    const manyQuestions = Array.from({ length: 22 }, (_, index) =>
      question(String(500 + index), `问题 ${index + 1}`),
    );
    let summaryQuestionIds: string[] = [];
    const questionFinder = finder(
      () =>
        Promise.resolve(
          successful(manyQuestions, { personal: manyQuestions.length }),
        ),
      (_ctx, questions) => {
        summaryQuestionIds = questions.map((item) => item.questionId);
        return Promise.resolve({
          ok: true,
          summaries: new Map(
            questions.map(({ questionId }) => [
              questionId,
              [`摘要 ${questionId}`],
            ]),
          ),
        });
      },
    );
    await withUseCases(
      async ({ usecases, app }) => {
        addAccount(usecases, "知乎号", "zhihu");
        await expect(
          usecases.gatherIdeas({
            topics: ["a", "b", "c", "d", "e", "f"],
          }),
        ).rejects.toMatchObject({ code: "USAGE", message: "主题词最多 5 个" });
        const report = await usecases.gatherIdeas();
        expect(report.pool).toHaveLength(20);
        expect(report.sources[0]).toMatchObject({ found: 22, added: 20 });
        expect(summaryQuestionIds).toHaveLength(20);
        expect(new Set(summaryQuestionIds)).toEqual(
          new Set(
            report.pool
              .filter((candidate) => candidate.payload.kind === "question")
              .map(
                (candidate) =>
                  candidate.payload.kind === "question" &&
                  candidate.payload.questionId,
              ),
          ),
        );
        expect(
          report.pool.every(
            (candidate) =>
              candidate.payload.kind === "question" &&
              candidate.payload.answerSummaries.length > 0,
          ),
        ).toBe(true);
        expect(app.store.candidates.list()).toHaveLength(20);
        expect(app.store.candidates.list({ state: ["skipped"] })).toHaveLength(
          0,
        );
        expect(
          report.sources.find((source) => source.name === "知乎主题推荐")
            ?.warning,
        ).toBe("没给主题词，跳过");
        expect(
          report.sources.find((source) => source.name === "知乎热榜")?.warning,
        ).toBe("没给主题词，跳过");
      },
      { questionFinder },
    );
  });

  it("摘要部分失败时保留成功结果并报告 warning", async () => {
    const questionFinder = finder(
      () =>
        Promise.resolve(
          successful([question("801", "问题一"), question("802", "问题二")]),
        ),
      () =>
        Promise.resolve({
          ok: true,
          summaries: new Map([["801", ["问题一摘要"]]]),
          warning: "问题二暂时无法获取回答",
        }),
    );
    await withUseCases(
      async ({ usecases }) => {
        addAccount(usecases, "知乎号", "zhihu");
        const report = await usecases.gatherIdeas();
        expect(
          report.sources.find((source) => source.name === "补回答摘要"),
        ).toMatchObject({
          found: 1,
          warning: "问题二暂时无法获取回答",
        });
        expect(
          report.pool.find((item) => item.key === questionKey("801"))?.payload,
        ).toMatchObject({
          kind: "question",
          answerSummaries: ["问题一摘要"],
        });
        expect(
          report.pool.find((item) => item.key === questionKey("802"))?.payload,
        ).toMatchObject({
          kind: "question",
          answerSummaries: [],
        });
      },
      { questionFinder },
    );
  });

  it("摘要密钥失效时标记过期但仍保存问题候选", async () => {
    const questionFinder = finder(
      () => Promise.resolve(successful([question("803", "待保存的问题")])),
      () =>
        Promise.resolve({
          ok: false,
          reason: "密钥失效 test-secret",
          expiredKey: "access-secret",
        }),
    );
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases, "知乎号", "zhihu", {
          "access-secret": "test-secret",
        });
        const report = await usecases.gatherIdeas();
        expect(report.pool).toHaveLength(1);
        expect(report.pool[0]?.payload).toMatchObject({
          kind: "question",
          questionId: "803",
          answerSummaries: [],
        });
        expect(
          report.sources.find((source) => source.name === "补回答摘要")
            ?.warning,
        ).toBe("密钥失效 <redacted>");
        expect(
          usecases.showAccount(account.id).account.settings,
        ).toContainEqual(
          expect.objectContaining({ key: "access-secret", status: "expired" }),
        );
      },
      { questionFinder },
    );
  });

  it("知乎密钥失效标过期；无知乎账号和合并期间新出现的回答都会拦截", async () => {
    const expiredFinder = finder(() =>
      Promise.resolve({
        ok: false,
        reason: "接口拒绝 test-secret",
        expiredKey: "access-secret",
      }),
    );
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases, "知乎号", "zhihu", {
          "access-secret": "test-secret",
        });
        const report = await usecases.gatherIdeas();
        expect(report.sources).toEqual([
          {
            name: "知乎问题",
            found: 0,
            added: 0,
            warning: "知乎问题：接口拒绝 <redacted>",
          },
          { name: "已发作品", found: 0, added: 0 },
          { name: "开发记录", found: 0, added: 0 },
        ]);
        expect(
          usecases.showAccount(account.id).account.settings,
        ).toContainEqual(
          expect.objectContaining({ key: "access-secret", status: "expired" }),
        );
      },
      { questionFinder: expiredFinder },
    );

    let sawNoAccount = false;
    await withUseCases(async ({ usecases }) => {
      const report = await usecases.gatherIdeas();
      expect(report.sources[0]).toMatchObject({
        name: "知乎问题",
        warning: "还没有知乎账号",
      });
      expect(report.pool).toEqual([]);
      sawNoAccount = true;
    });
    expect(sawNoAccount).toBe(true);

    let duringFind: (() => void) | undefined;
    const raceFinder = finder(() => {
      duringFind?.();
      return Promise.resolve(
        successful([question("700", "运行中新增的回答标题")]),
      );
    });
    await withUseCases(
      async ({ usecases, app }) => {
        const zhihu = addAccount(usecases, "知乎号", "zhihu");
        duringFind = () => {
          const work = createWork(usecases, zhihu.id, "运行中新增的回答标题");
          publishWork(app, work, { url: "https://www.zhihu.com/answer/701" });
        };
        const result = await usecases.gatherIdeas();
        expect(result.pool).toEqual([]);
        expect(
          app.store.candidates.getByKey(questionKey("700")),
        ).toBeUndefined();
      },
      { questionFinder: raceFinder },
    );
  });

  it("知乎账号在联网期间消失时仍可合并问题候选且不保留失效关联", async () => {
    let duringFind: (() => void) | undefined;
    const questionFinder = finder(() => {
      duringFind?.();
      return Promise.resolve(
        successful([question("710", "账号消失期间的问题")]),
      );
    });
    await withUseCases(
      async ({ usecases, app }) => {
        addAccount(usecases, "知乎号", "zhihu");
        duringFind = () => {
          app.store.accounts.list = () => [];
        };

        const report = await usecases.gatherIdeas();
        const candidate = app.store.candidates.getByKey(questionKey("710"));

        expect(report.pool).toHaveLength(1);
        expect(candidate).toMatchObject({
          kind: "question",
          state: "new",
          payload: { questionId: "710" },
        });
        expect(candidate?.accountId).toBeUndefined();
      },
      { questionFinder },
    );
  });

  it("联网期间删除灵感时，回来的重复问题不会复活被拒绝的候选", async () => {
    let duringFind: (() => void) | undefined;
    const questionFinder = finder(() => {
      duringFind?.();
      return Promise.resolve(successful([question("711", "已删除灵感的问题")]));
    });
    await withUseCases(
      async ({ usecases, app }) => {
        addAccount(usecases, "知乎号", "zhihu");
        const first = await usecases.gatherIdeas();
        const candidate = first.pool.find(
          (item) => item.key === questionKey("711"),
        );
        if (!candidate) throw new Error("没有初始问题候选");
        const [idea] = usecases.addIdeas([
          {
            text: candidate.title,
            source: "schedule",
            candidateId: candidate.id,
          },
        ]);
        if (!idea) throw new Error("灵感没有创建");
        duringFind = () => usecases.deleteIdea(idea.id);

        const report = await usecases.gatherIdeas();

        expect(usecases.listIdeas()).toEqual([]);
        expect(report.pool).toEqual([]);
        expect(app.store.candidates.get(candidate.id)).toMatchObject({
          state: "rejected",
          ideaId: idea.id,
        });
      },
      { questionFinder },
    );
  });
});
