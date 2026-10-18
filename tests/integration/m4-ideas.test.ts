import {
  questionKey,
  WORKFLOWS,
  type IdeaCandidate,
  type Work,
} from "@leafpress/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { M4IdeasZhihuApi } from "./m4-ideas-api.js";
import {
  ACCESS_SECRET,
  BLOG_TITLE,
  openM4IdeasEnvironment,
  TODAY,
} from "./m4-ideas-env.js";
import type { M4IdeasEnvironment } from "./m4-ideas-env.js";

const TOPICS = ["TypeScript", "数据"];
const AUTHOR_ANSWER_TITLE = "作者已经回答的 TypeScript 问题";
const EXISTING_QUESTION_ID = "777000";
const SNAPSHOT_DAYS = [
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
];

let env: M4IdeasEnvironment;
let zhihuApi: M4IdeasZhihuApi;
let zhihuAccountId = "";
let blogAccountId = "";
let primaryBlogWorkId = "";
let firstQuestionCandidateId = "";
let secondQuestionCandidateId = "";
let devlogCandidateId = "";
let deletedQuestionIdeaId = "";
let remainingQuestionIdeaId = "";
let unreviewedFollowupId = "";
let skippedCandidateIds: string[] = [];

function candidateForQuestion(
  candidates: IdeaCandidate[],
  questionId: string,
): IdeaCandidate {
  const candidate = candidates.find(
    (item) =>
      item.kind === "question" &&
      item.payload.kind === "question" &&
      item.payload.questionId === questionId,
  );
  if (!candidate) throw new Error(`没有问题 ${questionId} 的候选`);
  return candidate;
}

function publishedWork(
  app: M4IdeasEnvironment["app"],
  work: Work,
  url: string,
  publishedAt = "2026-09-15",
): Work {
  const published: Work = {
    ...work,
    status: "done",
    url,
    publishedAt,
    updatedAt: `${TODAY}T09:00:00+08:00`,
  };
  app.store.transaction(() => app.store.works.update(published));
  return published;
}

function addDailyGrowthSnapshots(
  app: M4IdeasEnvironment["app"],
  works: Work[],
): void {
  app.store.transaction(() => {
    works.forEach((work, workIndex) => {
      const dailyGrowth = [30, 20, 10][workIndex] ?? 5;
      SNAPSHOT_DAYS.forEach((day, dayIndex) => {
        app.store.snapshots.putWorkSnapshot({
          workId: work.id,
          day,
          totals: {
            pageviews: 1000 + dayIndex * dailyGrowth,
            visitors: 600 + dayIndex * Math.max(1, Math.floor(dailyGrowth / 3)),
          },
        });
      });
    });
  });
}

function ideaInput(candidate: IdeaCandidate) {
  if (candidate.payload.kind === "question")
    return {
      candidateId: candidate.id,
      text: candidate.title,
      detail: `来源问题：${candidate.url}\n写作角度：说明问题背景、约束和可复现的解决过程。`,
      source: "schedule" as const,
    };
  if (candidate.payload.kind === "devlog")
    return {
      candidateId: candidate.id,
      text: `${candidate.title} 本周开发记录`,
      detail: `开发记录路径：${candidate.payload.path}`,
      source: "devlog" as const,
    };
  throw new Error("本测试只从问题和开发记录候选创建灵感");
}

beforeAll(async () => {
  zhihuApi = new M4IdeasZhihuApi();
  env = await openM4IdeasEnvironment(zhihuApi.fetch);
});

afterAll(async () => {
  await env?.close();
});

describe("M4 灵感端到端", () => {
  it("1. 准备知乎、博客、已回答问题、已有灵感、增长快照和临时开发记录", () => {
    const { usecases, app } = env;
    const zhihu = usecases.addAccount({
      platform: "zhihu",
      name: "M4 知乎作者",
      intro: "集成测试知乎账号",
      settings: { "access-secret": ACCESS_SECRET },
    });
    const blog = usecases.addAccount({
      platform: "blog",
      name: "M4 博客账号",
      intro: "集成测试博客账号",
    });
    zhihuAccountId = zhihu.id;
    blogAccountId = blog.id;

    const blogTitles = [BLOG_TITLE, "年末阅读趋势复盘", "家庭烘焙记录整理"];
    const blogWorks = blogTitles.map((title, index) => {
      const [created] = usecases.createWorks({
        source: { kind: "new", title },
        accountIds: [blog.id],
        brief: "完成并发布的博客文章",
      });
      if (!created) throw new Error(`没有创建博客作品：${title}`);
      return publishedWork(
        app,
        created,
        `https://blog.example.test/posts/m4-${index + 1}`,
      );
    });
    primaryBlogWorkId = blogWorks[0]?.id ?? "";
    addDailyGrowthSnapshots(app, blogWorks);

    const [authorAnswer] = usecases.createWorks({
      source: { kind: "new", title: AUTHOR_ANSWER_TITLE },
      accountIds: [zhihu.id],
      brief: "已经在知乎回答过",
    });
    if (!authorAnswer) throw new Error("没有创建作者回答作品");
    publishedWork(
      app,
      authorAnswer,
      "https://www.zhihu.com/answer/880103",
      "2026-10-07",
    );

    usecases.addIdeas([
      {
        text: "过去收集的架构问题",
        detail: "留作重复问题排除夹具。",
        source: "quick",
        sourceDetail: `https://www.zhihu.com/question/${EXISTING_QUESTION_ID}`,
      },
    ]);

    expect(
      usecases
        .listAccounts()
        .map((account) => account.platform)
        .sort(),
    ).toEqual(["blog", "zhihu"]);
    expect(
      app.store.snapshots.workSnapshots("2026-09-30", "2026-10-07"),
    ).toHaveLength(24);
    expect(
      usecases.listWorks().filter((work) => work.status === "done"),
    ).toHaveLength(4);
    expect(env.project).toContain(env.devRoot);
  });

  it("2. gather 合并四种知乎发现来源，并收进续写与真实开发记录", async () => {
    const report = await env.usecases.gatherIdeas({ topics: TOPICS });
    const expectedNames = [
      "知乎个性化推荐",
      "知乎主题推荐",
      "博客反找问题",
      "知乎热榜",
      "补回答摘要",
      "已发作品",
      "开发记录",
    ];
    expect(report.sources.map((source) => source.name)).toEqual(expectedNames);
    expect(report.sources).toMatchObject([
      { name: "知乎个性化推荐", found: 4, added: 2 },
      { name: "知乎主题推荐", found: 4, added: 4 },
      { name: "博客反找问题", found: 2, added: 2 },
      { name: "知乎热榜", found: 2, added: 2 },
      { name: "补回答摘要", found: 7, added: 0 },
      { name: "已发作品", found: 3, added: 3 },
      { name: "开发记录", found: 1, added: 1 },
    ]);
    expect(report.pool.map((candidate) => candidate.kind)).toEqual(
      expect.arrayContaining(["question", "followup", "devlog"]),
    );

    const merged = candidateForQuestion(report.pool, "101");
    expect(merged).toMatchObject({
      accountId: zhihuAccountId,
      url: "https://www.zhihu.com/question/101",
      payload: {
        questionId: "101",
        via: ["personal", "topic", "blog", "hot"],
        topics: ["TypeScript", "数据"],
        blogWorkIds: [primaryBlogWorkId],
        relatedWorkIds: [primaryBlogWorkId],
        answerSummaries: [
          "针对问题 101 的回答摘要。 补充一条可验证的实践经验。",
        ],
      },
    });
    expect(
      report.pool.some(
        (candidate) =>
          candidate.payload.kind === "question" &&
          ["103", EXISTING_QUESTION_ID, "110", "998"].includes(
            candidate.payload.questionId,
          ),
      ),
    ).toBe(false);

    const followups = report.pool.filter(
      (candidate) => candidate.kind === "followup",
    );
    expect(followups).toHaveLength(3);
    expect(
      followups.every(
        (candidate) =>
          candidate.payload.kind === "followup" &&
          candidate.payload.growth > 0 &&
          candidate.payload.platform === "blog",
      ),
    ).toBe(true);
    const devlog = report.pool.find((candidate) => candidate.kind === "devlog");
    expect(devlog).toMatchObject({
      title: "leafpress-sample",
      payload: {
        kind: "devlog",
        repo: "leafpress-sample",
        commits: ["补充定时调度", "实现数据清洗", "建立采集入口"],
        logs: [
          {
            file: "2026-10-08.md",
            headings: ["完成数据清洗", "下一步补充测试"],
          },
        ],
      },
    });
    expect(
      zhihuApi.requests.some(
        (request) =>
          request.path === "/user/question_recommendations" &&
          !Object.hasOwn(request.query, "Query") &&
          request.query["Count"] === "20",
      ),
    ).toBe(true);
    expect(
      zhihuApi.requests.some(
        (request) =>
          request.path === "/content/hot_list" &&
          request.query["Limit"] === "30",
      ),
    ).toBe(true);
    expect(
      zhihuApi.requests.some(
        (request) =>
          request.path === "/content/question_answers" &&
          request.query["QuestionUrl"] ===
            "https://www.zhihu.com/question/101" &&
          request.query["Limit"] === "3",
      ),
    ).toBe(true);

    firstQuestionCandidateId = merged.id;
    secondQuestionCandidateId = candidateForQuestion(report.pool, "106").id;
    devlogCandidateId = devlog?.id ?? "";
    unreviewedFollowupId = followups[0]?.id ?? "";
  });

  it("3. 批量把两个问题和一条开发记录推入收件箱，重复候选整批失败", () => {
    const { usecases, app } = env;
    const candidates = usecases.listCandidates();
    const firstQuestion = candidates.find(
      (candidate) => candidate.id === firstQuestionCandidateId,
    );
    const secondQuestion = candidates.find(
      (candidate) => candidate.id === secondQuestionCandidateId,
    );
    const devlog = candidates.find(
      (candidate) => candidate.id === devlogCandidateId,
    );
    if (!firstQuestion || !secondQuestion || !devlog)
      throw new Error("待推送的候选不在池里");

    const added = usecases.addIdeas([
      ideaInput(firstQuestion),
      ideaInput(secondQuestion),
      ideaInput(devlog),
    ]);
    expect(added).toHaveLength(3);
    const inbox = usecases.listIdeas({ status: ["inbox"] });
    expect(inbox.slice(0, 3).map((idea) => idea.id)).toEqual(
      added.map((idea) => idea.id),
    );
    expect(added.slice(0, 2).map((idea) => idea)).toEqual([
      expect.objectContaining({
        accountId: zhihuAccountId,
        sourceDetail: "https://www.zhihu.com/question/101",
      }),
      expect.objectContaining({
        accountId: zhihuAccountId,
        sourceDetail: "https://www.zhihu.com/question/106",
      }),
    ]);
    expect(
      added.every(
        (idea) =>
          idea.detail.includes("来源问题：") || idea.source === "devlog",
      ),
    ).toBe(true);
    expect(app.store.candidates.get(firstQuestionCandidateId)?.state).toBe(
      "suggested",
    );
    expect(app.store.candidates.get(secondQuestionCandidateId)?.state).toBe(
      "suggested",
    );
    expect(app.store.candidates.get(devlogCandidateId)?.state).toBe(
      "suggested",
    );
    deletedQuestionIdeaId = added[0]?.id ?? "";
    remainingQuestionIdeaId = added[1]?.id ?? "";

    const poolBefore = usecases.listCandidates();
    const ideasBefore = usecases.listIdeas();
    const unselectedQuestion = candidateForQuestion(poolBefore, "104");
    expect(() =>
      usecases.addIdeas([
        { ...ideaInput(firstQuestion), text: "重复推送" },
        { ...ideaInput(unselectedQuestion), text: "同批新增不应落库" },
      ]),
    ).toThrow(/已经推过/);
    expect(usecases.listIdeas()).toEqual(ideasBefore);
    expect(app.store.candidates.get(unselectedQuestion.id)?.state).toBe("new");
  });

  it("4. 跳过已看未选的候选，池中只留未查看的续写", () => {
    const { usecases, app } = env;
    const candidates = usecases.listCandidates();
    expect(candidates.map((candidate) => candidate.id)).toContain(
      unreviewedFollowupId,
    );
    skippedCandidateIds = candidates
      .filter((candidate) => candidate.id !== unreviewedFollowupId)
      .map((candidate) => candidate.id);
    usecases.skipCandidates(skippedCandidateIds);

    expect(usecases.listCandidates().map((candidate) => candidate.id)).toEqual([
      unreviewedFollowupId,
    ]);
    for (const id of skippedCandidateIds)
      expect(app.store.candidates.get(id)?.state).toBe("skipped");
    expect(app.store.candidates.get(unreviewedFollowupId)?.state).toBe("new");
  });

  it("5. 删除问题灵感后，将它的原候选永久标为不要", () => {
    const { usecases, app } = env;
    usecases.deleteIdea(deletedQuestionIdeaId);
    expect(
      usecases.listIdeas().some((idea) => idea.id === deletedQuestionIdeaId),
    ).toBe(false);
    expect(app.store.candidates.get(firstQuestionCandidateId)).toMatchObject({
      state: "rejected",
      ideaId: deletedQuestionIdeaId,
    });
    expect(
      usecases.listIdeas().some((idea) => idea.id === remainingQuestionIdeaId),
    ).toBe(true);
  });

  it("6. 再次 gather 时跳过、已推、已删的问题不回池，新问题入池", async () => {
    const { usecases, app } = env;
    zhihuApi.addExtraQuestion();
    const report = await usecases.gatherIdeas({ topics: TOPICS });
    const questionIds = report.pool.flatMap((candidate) =>
      candidate.payload.kind === "question"
        ? [candidate.payload.questionId]
        : [],
    );
    expect(questionIds).toEqual(["109"]);
    expect(report.pool.map((candidate) => candidate.id)).toContain(
      unreviewedFollowupId,
    );
    expect(
      report.pool.some((candidate) =>
        skippedCandidateIds.includes(candidate.id),
      ),
    ).toBe(false);
    expect(app.store.candidates.get(firstQuestionCandidateId)?.state).toBe(
      "rejected",
    );
    expect(app.store.candidates.get(secondQuestionCandidateId)?.state).toBe(
      "suggested",
    );
    for (const id of skippedCandidateIds)
      expect(app.store.candidates.get(id)?.state).toBe("skipped");
    expect(
      report.sources.find((source) => source.name === "知乎个性化推荐"),
    ).toMatchObject({ found: 5, added: 1 });
  });

  it("7. 把剩余问题灵感转成知乎作品，并从共享目录匹配回答问题工作流", () => {
    const { usecases } = env;
    const idea = usecases
      .listIdeas({ status: ["inbox"] })
      .find((item) => item.id === remainingQuestionIdeaId);
    if (!idea) throw new Error("剩余的问题灵感不存在");
    const answerWorkflow = WORKFLOWS.find(
      (workflow) => workflow.name === "回答问题",
    );
    if (!answerWorkflow) throw new Error("共享工作流目录没有回答问题工作流");
    const [work] = usecases.createWorks({
      source: { kind: "idea", ideaId: idea.id },
      accountIds: [zhihuAccountId],
      brief: idea.detail,
    });
    expect(work?.workflowId).toBe(answerWorkflow.id);
    expect(work?.brief).toContain("https://www.zhihu.com/question/106");
    expect(work?.source).toEqual({ kind: "idea", ideaId: idea.id });
    expect(
      usecases.listIdeas().find((item) => item.id === idea.id)?.status,
    ).toBe("converted");
  });

  it("8. 知乎密钥失效时报告过期，但续写和开发记录来源仍运行", async () => {
    const { usecases } = env;
    zhihuApi.expireAccessSecret();
    const report = await usecases.gatherIdeas({ topics: TOPICS });
    const questionSource = report.sources.find(
      (source) => source.name === "知乎问题",
    );
    expect(questionSource).toMatchObject({
      found: 0,
      added: 0,
      warning: "知乎问题：知乎开放平台密钥不对或已过期",
    });
    expect(questionSource?.warning).not.toContain(ACCESS_SECRET);
    expect(report.sources).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({ name: "已发作品", found: 1 }),
        expect.objectContaining({ name: "开发记录", found: 1 }),
      ]),
    );
    expect(
      usecases
        .showAccount(zhihuAccountId)
        .account.settings.find((setting) => setting.key === "access-secret")
        ?.status,
    ).toBe("expired");
    expect(blogAccountId).not.toBe(zhihuAccountId);
    expect(appCandidateKey(env, "109")).toBe(true);
  });
});

function appCandidateKey(
  environment: M4IdeasEnvironment,
  questionId: string,
): boolean {
  return (
    environment.app.store.candidates.getByKey(questionKey(questionId))
      ?.state === "new"
  );
}
