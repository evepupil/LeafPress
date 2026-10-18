import {
  addDays,
  buildDataset,
  DATASET_DAYS,
  dayOf,
  isBlocked,
  pickQuestions,
  questionKey,
  questionIdsIn,
  relatedWorkIds,
  scoreQuestion,
  sortCandidates,
  titleKey,
  toIsoTime,
  trimPool,
  type Account,
  type CandidatePayload,
  type GatherReport,
  type GatherSourceReport,
  type IdeaCandidate,
  type QuestionPayload,
  type QuestionVia,
  type UseCases,
  type Work,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import type {
  FoundQuestion,
  QuestionFinderOutcome,
  QuestionFinderStage,
  QuestionSummaryOutcome,
} from "../platforms/types.js";
import { listAccounts, nowParts, redactText } from "./support.js";
import type { AppContext } from "./context.js";
import {
  findFollowupDrafts,
  type FollowupDraft,
} from "./ideas-gather-followups.js";
import {
  findDevlogDrafts,
  resolveDevRoots,
  type DevlogDraft,
} from "./ideas-gather-devlog.js";

const VIA_ORDER: QuestionVia[] = ["personal", "topic", "blog", "hot"];
const QUESTION_STAGES: {
  stage: QuestionFinderStage["stage"];
  name: string;
}[] = [
  { stage: "personal", name: "知乎个性化推荐" },
  { stage: "topic", name: "知乎主题推荐" },
  { stage: "blog", name: "博客反找问题" },
  { stage: "hot", name: "知乎热榜" },
];

type CandidateDraft = Omit<
  IdeaCandidate,
  "id" | "firstSeenAt" | "updatedAt" | "state"
>;

type IncomingCandidate = {
  draft: CandidateDraft;
  sources: string[];
};

interface GatherSnapshot {
  accounts: Account[];
  works: Work[];
  ideas: ReturnType<AppContext["store"]["ideas"]["list"]>;
  candidates: IdeaCandidate[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeProgress(
  callback: ((message: string) => void) | undefined,
  message: string,
): void {
  try {
    callback?.(message);
  } catch {
    // 进度输出不能改变来源采集结果。
  }
}

function accountSerial(id: string): number {
  const suffix = /-(\d+)$/.exec(id)?.[1];
  return suffix === undefined ? Number.MAX_SAFE_INTEGER : Number(suffix);
}

function firstZhihuAccount(accounts: Account[]): Account | undefined {
  return accounts
    .filter((account) => account.platform === "zhihu")
    .sort(
      (a, b) =>
        accountSerial(a.id) - accountSerial(b.id) || a.id.localeCompare(b.id),
    )[0];
}

function getQuestionIdsToSkip(
  accounts: Account[],
  works: Work[],
  ideas: GatherSnapshot["ideas"],
  candidates: IdeaCandidate[],
  now: string,
): { ids: Set<string>; authorTitles: Set<string> } {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const zhihuWorks = works.filter(
    (work) => accountById.get(work.accountId)?.platform === "zhihu",
  );
  const ids = new Set<string>();
  for (const work of zhihuWorks)
    for (const questionId of questionIdsIn(work.url ?? "")) ids.add(questionId);
  for (const idea of ideas) {
    for (const text of [idea.text, idea.detail, idea.sourceDetail ?? ""])
      for (const questionId of questionIdsIn(text)) ids.add(questionId);
  }
  for (const work of works) {
    for (const text of [work.title, work.brief])
      for (const questionId of questionIdsIn(text)) ids.add(questionId);
  }
  for (const candidate of candidates) {
    if (candidate.payload.kind === "question" && isBlocked(candidate, now))
      ids.add(candidate.payload.questionId);
  }
  return {
    ids,
    authorTitles: new Set(
      zhihuWorks.map((work) => titleKey(work.title)).filter((key) => key),
    ),
  };
}

function chooseBlogs(
  accounts: Account[],
  works: Work[],
  probes: Map<string, string>,
  today: string,
): { workId: string; title: string }[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const recentCutoff = addDays(today, -30);
  return works
    .filter((work) => {
      if (
        accountById.get(work.accountId)?.platform !== "blog" ||
        work.status !== "done" ||
        !work.url ||
        !work.title.trim()
      )
        return false;
      const probedAt = probes.get(`blog:${work.id}`);
      return probedAt === undefined || dayOf(probedAt) <= recentCutoff;
    })
    .sort(
      (a, b) =>
        Number(probes.has(`blog:${a.id}`)) -
          Number(probes.has(`blog:${b.id}`)) ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
    .map((work) => ({ workId: work.id, title: work.title }));
}

function orderedVia(values: readonly QuestionVia[]): QuestionVia[] {
  return VIA_ORDER.filter((via) => values.includes(via));
}

function union<T>(...lists: readonly T[][]): T[] {
  return [...new Set(lists.flat())];
}

function mergeFoundQuestions(questions: FoundQuestion[]): FoundQuestion[] {
  const merged = new Map<string, FoundQuestion>();
  for (const question of questions) {
    const current = merged.get(question.questionId);
    if (!current) {
      merged.set(question.questionId, {
        ...question,
        via: orderedVia(question.via),
        topics: [...question.topics],
        blogWorkIds: [...question.blogWorkIds],
        answerSummaries: [...question.answerSummaries],
      });
      continue;
    }
    if (!current.title && question.title) current.title = question.title;
    current.via = orderedVia(union(current.via, question.via));
    current.topics = union(current.topics, question.topics);
    current.blogWorkIds = union(current.blogWorkIds, question.blogWorkIds);
    if (question.answerSummaries.length)
      current.answerSummaries = [...question.answerSummaries];
  }
  return [...merged.values()];
}

function stageReport(
  outcome: Extract<QuestionFinderOutcome, { ok: true }>,
  topics: string[],
  accountId: string,
  app: AppContext,
): GatherSourceReport[] {
  return QUESTION_STAGES.map(({ stage, name }) => {
    const result = outcome.stages.find((item) => item.stage === stage);
    const warnings: string[] = [];
    if (result?.warning)
      warnings.push(redactText(app, accountId, result.warning));
    if ((stage === "topic" || stage === "hot") && topics.length === 0)
      warnings.push("没给主题词，跳过");
    return {
      name,
      found: result?.found ?? 0,
      added: 0,
      ...(warnings.length === 0
        ? {}
        : { warning: [...new Set(warnings)].join("；") }),
    };
  });
}

function markExpiredQuestionSecret(
  app: AppContext,
  account: Account,
  key: string,
  reason: string,
  at: string,
): void {
  app.store.transaction(() => {
    if (app.store.accounts.get(account.id))
      app.store.settings.markExpired(account.id, key, reason, at);
  });
}

function sourceNameForVia(via: QuestionVia): string {
  switch (via) {
    case "personal":
      return "知乎个性化推荐";
    case "topic":
      return "知乎主题推荐";
    case "blog":
      return "博客反找问题";
    case "hot":
      return "知乎热榜";
  }
}

function questionDraft(
  found: FoundQuestion,
  accountId: string | undefined,
  works: Work[],
): CandidateDraft {
  const relatedIds = relatedWorkIds(found.title, works);
  const payload: QuestionPayload = {
    kind: "question",
    questionId: found.questionId,
    via: orderedVia(found.via),
    topics: found.topics,
    blogWorkIds: found.blogWorkIds,
    answerSummaries: found.answerSummaries,
    relatedWorkIds: relatedIds,
  };
  return {
    key: questionKey(found.questionId),
    kind: "question",
    title: found.title,
    url: `https://www.zhihu.com/question/${found.questionId}`,
    ...(accountId === undefined ? {} : { accountId }),
    score: scoreQuestion({ via: payload.via, relatedWorkIds: relatedIds }),
    payload,
  };
}

function payloadForExisting(
  existing: IdeaCandidate | undefined,
  draft: CandidateDraft,
  works: Work[],
): CandidatePayload {
  if (draft.kind !== "question" || draft.payload.kind !== "question")
    return draft.payload;
  const previous =
    existing?.payload.kind === "question" ? existing.payload : undefined;
  const relatedIds = relatedWorkIds(draft.title, works);
  return {
    ...draft.payload,
    answerSummaries:
      draft.payload.answerSummaries.length > 0
        ? draft.payload.answerSummaries
        : (previous?.answerSummaries ?? []),
    relatedWorkIds: relatedIds,
  };
}

function isQuestionBlockedByCurrentContent(
  draft: CandidateDraft,
  blockedIds: ReadonlySet<string>,
  authorTitles: ReadonlySet<string>,
): boolean {
  if (draft.kind !== "question" || draft.payload.kind !== "question")
    return false;
  const key = titleKey(draft.title);
  return (
    blockedIds.has(draft.payload.questionId) ||
    (key !== "" && authorTitles.has(key))
  );
}

function questionSummaryTargets(input: {
  snapshot: GatherSnapshot;
  foundQuestions: FoundQuestion[];
  questionAccountId: string;
  now: string;
}): { questionId: string; url: string }[] {
  const { snapshot, foundQuestions, questionAccountId, now } = input;
  const { ids, authorTitles } = getQuestionIdsToSkip(
    snapshot.accounts,
    snapshot.works,
    snapshot.ideas,
    snapshot.candidates,
    now,
  );
  const existingByKey = new Map(
    snapshot.candidates.map((candidate) => [candidate.key, candidate]),
  );
  const pool = new Map<
    string,
    {
      questionId: string;
      url: string;
      via: QuestionVia[];
      score: number;
      answerSummaries: string[];
    }
  >();

  for (const candidate of snapshot.candidates) {
    if (candidate.state !== "new" || candidate.payload.kind !== "question")
      continue;
    const title = titleKey(candidate.title);
    if (
      ids.has(candidate.payload.questionId) ||
      (title !== "" && authorTitles.has(title))
    )
      continue;
    pool.set(candidate.key, {
      questionId: candidate.payload.questionId,
      url:
        candidate.url ??
        `https://www.zhihu.com/question/${candidate.payload.questionId}`,
      via: candidate.payload.via,
      score: candidate.score,
      answerSummaries: candidate.payload.answerSummaries,
    });
  }

  for (const found of mergeFoundQuestions(foundQuestions)) {
    const draft = questionDraft(found, questionAccountId, snapshot.works);
    if (isQuestionBlockedByCurrentContent(draft, ids, authorTitles)) continue;
    const existing = existingByKey.get(draft.key);
    if (existing && isBlocked(existing, now)) continue;
    const payload = payloadForExisting(existing, draft, snapshot.works);
    if (payload.kind !== "question") continue;
    pool.set(draft.key, {
      questionId: payload.questionId,
      url: draft.url ?? `https://www.zhihu.com/question/${payload.questionId}`,
      via: payload.via,
      score: scoreQuestion({
        via: payload.via,
        relatedWorkIds: payload.relatedWorkIds,
      }),
      answerSummaries: payload.answerSummaries,
    });
  }

  return pickQuestions([...pool.values()], 20)
    .filter((question) => question.answerSummaries.length === 0)
    .map(({ questionId, url }) => ({ questionId, url }));
}

function mergeCandidates(input: {
  app: AppContext;
  drafts: IncomingCandidate[];
  at: string;
  now: string;
  eligibleQuestions: FoundQuestion[];
  questionAccountId?: string;
  questionSummaries: ReadonlyMap<string, string[]>;
  probesToWrite: string[];
}): { pool: IdeaCandidate[]; addedBySource: Map<string, number> } {
  const { app } = input;
  return app.store.transaction(() => {
    // 联网期间候选、灵感和作品可能变化；写事务里重读后再决定是否能进池。
    const accounts = listAccounts(app);
    const works = app.store.works.list();
    const ideas = app.store.ideas.list();
    const candidates = app.store.candidates.list();
    const byKey = new Map(
      candidates.map((candidate) => [candidate.key, candidate]),
    );
    const blocked = getQuestionIdsToSkip(
      accounts,
      works,
      ideas,
      candidates,
      input.now,
    );
    const incoming = [...input.drafts];

    if (input.questionAccountId !== undefined) {
      const questionAccountId = accounts.some(
        (account) =>
          account.id === input.questionAccountId &&
          account.platform === "zhihu",
      )
        ? input.questionAccountId
        : undefined;
      for (const found of mergeFoundQuestions(input.eligibleQuestions)) {
        const draft = questionDraft(found, questionAccountId, works);
        if (
          isQuestionBlockedByCurrentContent(
            draft,
            blocked.ids,
            blocked.authorTitles,
          )
        )
          continue;
        incoming.push({
          draft,
          sources: [...new Set(found.via.map(sourceNameForVia))],
        });
      }
    }

    // 先把已在池里的新问题清出池，避免答案作品或旧灵感刚导入后仍留在列表。
    for (const candidate of candidates) {
      if (
        candidate.state === "new" &&
        candidate.payload.kind === "question" &&
        (blocked.ids.has(candidate.payload.questionId) ||
          (titleKey(candidate.title) !== "" &&
            blocked.authorTitles.has(titleKey(candidate.title))))
      ) {
        const skipped = {
          ...candidate,
          state: "skipped" as const,
          updatedAt: input.at,
        };
        app.store.candidates.update(skipped);
        byKey.set(skipped.key, skipped);
      }
    }

    const entered = new Map<string, string[]>();
    for (const { draft, sources } of incoming) {
      const existing = byKey.get(draft.key);
      if (existing && isBlocked(existing, input.now)) continue;
      if (
        isQuestionBlockedByCurrentContent(
          draft,
          blocked.ids,
          blocked.authorTitles,
        )
      )
        continue;

      const payload = payloadForExisting(existing, draft, works);
      const score =
        payload.kind === "question"
          ? scoreQuestion({
              via: payload.via,
              relatedWorkIds: payload.relatedWorkIds,
            })
          : draft.score;
      const candidate: IdeaCandidate = existing
        ? {
            ...existing,
            kind: draft.kind,
            title: draft.title,
            score,
            state: "new",
            payload,
            updatedAt: input.at,
          }
        : {
            id: `c-${app.store.meta.nextSerial("candidate")}`,
            key: draft.key,
            kind: draft.kind,
            title: draft.title,
            ...(draft.url === undefined ? {} : { url: draft.url }),
            ...(draft.accountId === undefined
              ? {}
              : { accountId: draft.accountId }),
            score,
            state: "new",
            payload,
            firstSeenAt: input.at,
            updatedAt: input.at,
          };
      if (existing) {
        if (draft.url === undefined) delete candidate.url;
        else candidate.url = draft.url;
        // 已存在候选的账号归属固定在第一次入池时，不随后续账号选择改变。
      }
      if (existing) app.store.candidates.update(candidate);
      else app.store.candidates.insert(candidate);
      byKey.set(candidate.key, candidate);
      if (!existing || existing.state === "skipped")
        entered.set(candidate.key, sources);
    }

    for (const [questionId, answerSummaries] of input.questionSummaries) {
      const candidate = byKey.get(questionKey(questionId));
      if (
        candidate?.state !== "new" ||
        candidate.payload.kind !== "question" ||
        candidate.payload.answerSummaries.length > 0
      )
        continue;
      const updated = {
        ...candidate,
        payload: { ...candidate.payload, answerSummaries },
        updatedAt: input.at,
      };
      app.store.candidates.update(updated);
      byKey.set(updated.key, updated);
    }

    const { overflow } = trimPool(
      [...byKey.values()].filter((candidate) => candidate.state === "new"),
    );
    const overflowIds = new Set(overflow.map((candidate) => candidate.id));
    for (const candidate of overflow) {
      app.store.candidates.remove(candidate.id);
      byKey.delete(candidate.key);
    }

    for (const key of input.probesToWrite)
      app.store.probes.set(`blog:${key}`, input.at);

    const addedBySource = new Map<string, number>();
    for (const [key, sources] of entered) {
      const candidate = byKey.get(key);
      if (
        !candidate ||
        candidate.state !== "new" ||
        overflowIds.has(candidate.id)
      )
        continue;
      for (const source of sources)
        addedBySource.set(source, (addedBySource.get(source) ?? 0) + 1);
    }
    return {
      pool: sortCandidates(app.store.candidates.list({ state: ["new"] })),
      addedBySource,
    };
  });
}

function addCounts(
  sources: GatherSourceReport[],
  addedBySource: ReadonlyMap<string, number>,
): void {
  for (const source of sources)
    source.added = addedBySource.get(source.name) ?? 0;
}

function probeMap(app: AppContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const work of app.store.works.list()) {
    const at = app.store.probes.get(`blog:${work.id}`);
    if (at !== undefined) map.set(`blog:${work.id}`, at);
  }
  return map;
}

function readGatherSnapshot(app: AppContext): GatherSnapshot {
  return app.store.transaction(() => ({
    accounts: listAccounts(app),
    works: app.store.works.list(),
    ideas: app.store.ideas.list(),
    candidates: app.store.candidates.list(),
  }));
}

export function createIdeasGatherUseCases(
  app: AppContext,
): Pick<UseCases, "gatherIdeas" | "listCandidates" | "skipCandidates"> {
  return {
    async gatherIdeas(input): Promise<GatherReport> {
      const topics = [
        ...new Set(
          (input?.topics ?? []).map((topic) => topic.trim()).filter(Boolean),
        ),
      ];
      if (topics.length > 5)
        throw new LeafPressError("USAGE", "主题词最多 5 个");

      const { at, date, today } = nowParts(app);
      const now = toIsoTime(date);
      const snapshot = readGatherSnapshot(app);
      const probes = app.store.transaction(() => probeMap(app));
      const { ids: skipQuestionIds } = getQuestionIdsToSkip(
        snapshot.accounts,
        snapshot.works,
        snapshot.ideas,
        snapshot.candidates,
        now,
      );
      const blogWorks = chooseBlogs(
        snapshot.accounts,
        snapshot.works,
        probes,
        today,
      );
      const questionAccount = firstZhihuAccount(snapshot.accounts);
      const finder = questionAccount
        ? app.platforms.questionFinder("zhihu")
        : undefined;
      let questionOutcome: QuestionFinderOutcome | undefined;
      let questionFailure: string | undefined;

      if (!questionAccount) {
        safeProgress(input?.onProgress, "知乎问题…");
        questionFailure = "还没有知乎账号";
      } else if (!finder) {
        safeProgress(input?.onProgress, "知乎问题…");
        questionFailure = "没有配置知乎找问题工具";
      } else {
        try {
          questionOutcome = await finder.find({
            account: questionAccount,
            topics,
            blogs: blogWorks,
            skipQuestionIds,
            secret: (key) => app.credentials.get(questionAccount.id, key),
            fetch: app.fetch,
            sleep: (ms) => app.sleep(ms),
            ...(input?.onProgress === undefined
              ? {}
              : {
                  progress: (message: string) =>
                    safeProgress(input.onProgress, message),
                }),
          });
        } catch (error) {
          questionFailure = redactText(
            app,
            questionAccount.id,
            errorText(error),
          );
        }
      }

      const reports: GatherSourceReport[] = [];
      let foundQuestions: FoundQuestion[] = [];
      const questionSummaries = new Map<string, string[]>();
      let probesToWrite: string[] = [];
      if (questionFailure !== undefined) {
        reports.push({
          name: "知乎问题",
          found: 0,
          added: 0,
          warning:
            questionAccount === undefined
              ? questionFailure
              : `知乎问题：${questionFailure}`,
        });
      } else if (questionOutcome?.ok === false) {
        const reason = questionAccount
          ? redactText(app, questionAccount.id, questionOutcome.reason)
          : questionOutcome.reason;
        if (questionOutcome.expiredKey && questionAccount)
          markExpiredQuestionSecret(
            app,
            questionAccount,
            questionOutcome.expiredKey,
            reason,
            at,
          );
        reports.push({
          name: "知乎问题",
          found: 0,
          added: 0,
          warning: `知乎问题：${reason}`,
        });
      } else if (questionOutcome?.ok === true && questionAccount) {
        reports.push(
          ...stageReport(questionOutcome, topics, questionAccount.id, app),
        );
        foundQuestions = questionOutcome.questions;
        const summaryTargets = questionSummaryTargets({
          snapshot,
          foundQuestions,
          questionAccountId: questionAccount.id,
          now,
        });
        let summaryWarning: string | undefined;
        if (summaryTargets.length > 0) {
          safeProgress(input?.onProgress, "知乎：补回答摘要");
          const quotaWasExhausted = questionOutcome.stages.some((stage) =>
            stage.warning?.includes("今天问题发现的额度用完了"),
          );
          if (quotaWasExhausted) {
            summaryWarning = "今天问题发现的额度用完了，只补了 0 个";
          } else if (finder) {
            let summaryOutcome: QuestionSummaryOutcome | undefined;
            try {
              summaryOutcome = await finder.summarize(
                {
                  account: questionAccount,
                  secret: (key) => app.credentials.get(questionAccount.id, key),
                  fetch: app.fetch,
                  sleep: (ms) => app.sleep(ms),
                  ...(input?.onProgress === undefined
                    ? {}
                    : {
                        progress: (message: string) =>
                          safeProgress(input.onProgress, message),
                      }),
                },
                summaryTargets,
              );
            } catch (error) {
              summaryWarning = redactText(
                app,
                questionAccount.id,
                errorText(error),
              );
            }
            if (summaryOutcome?.ok === false) {
              const reason = redactText(
                app,
                questionAccount.id,
                summaryOutcome.reason,
              );
              if (summaryOutcome.expiredKey)
                markExpiredQuestionSecret(
                  app,
                  questionAccount,
                  summaryOutcome.expiredKey,
                  reason,
                  at,
                );
              summaryWarning = reason;
            } else if (summaryOutcome?.ok === true) {
              const requestedIds = new Set(
                summaryTargets.map((question) => question.questionId),
              );
              for (const [questionId, values] of summaryOutcome.summaries)
                if (requestedIds.has(questionId) && values.length > 0)
                  questionSummaries.set(questionId, values);
              if (summaryOutcome.warning)
                summaryWarning = redactText(
                  app,
                  questionAccount.id,
                  summaryOutcome.warning,
                );
            }
          }
        }
        foundQuestions = foundQuestions.map((question) => {
          const answerSummaries = questionSummaries.get(question.questionId);
          return answerSummaries === undefined
            ? question
            : { ...question, answerSummaries };
        });
        reports.push({
          name: "补回答摘要",
          found: questionSummaries.size,
          added: 0,
          ...(summaryWarning === undefined ? {} : { warning: summaryWarning }),
        });
        const blogStage = questionOutcome.stages.find(
          (stage) => stage.stage === "blog",
        );
        if (!blogStage?.warning)
          probesToWrite = blogWorks.map((blog) => blog.workId);
      }

      safeProgress(input?.onProgress, "已发作品…");
      let followupDrafts: FollowupDraft[] = [];
      let followupWarning: string | undefined;
      try {
        const from = addDays(today, -DATASET_DAYS);
        const to = addDays(today, -1);
        const data = app.store.transaction(() => ({
          accountDays: app.store.snapshots.accountDays(from, to),
          workSnapshots: app.store.snapshots.workSnapshots(from, to),
        }));
        const dataset = buildDataset({
          today,
          accounts: snapshot.accounts,
          works: snapshot.works,
          ...data,
        });
        followupDrafts = findFollowupDrafts({
          today,
          accounts: snapshot.accounts,
          works: snapshot.works,
          candidates: snapshot.candidates,
          dataset,
          catalog: app.catalog,
        });
      } catch (error) {
        followupWarning = errorText(error);
      }
      reports.push({
        name: "已发作品",
        found: followupDrafts.length,
        added: 0,
        ...(followupWarning === undefined ? {} : { warning: followupWarning }),
      });

      safeProgress(input?.onProgress, "开发记录…");
      let devlogDrafts: DevlogDraft[] = [];
      let devlogWarning: string | undefined;
      try {
        devlogDrafts = await findDevlogDrafts({
          readDevActivity: app.readDevActivity,
          roots: resolveDevRoots(app.devRoots ?? app.config.ideas.devRoots),
          exec: app.exec,
          today,
        });
      } catch (error) {
        devlogWarning = errorText(error);
      }
      reports.push({
        name: "开发记录",
        found: devlogDrafts.length,
        added: 0,
        ...(devlogWarning === undefined ? {} : { warning: devlogWarning }),
      });

      const draftInputs: IncomingCandidate[] = [
        ...followupDrafts.map((draft) => ({ draft, sources: ["已发作品"] })),
        ...devlogDrafts.map((draft) => ({ draft, sources: ["开发记录"] })),
      ];
      const merged = mergeCandidates({
        app,
        drafts: draftInputs,
        at,
        now,
        eligibleQuestions: foundQuestions,
        ...(questionAccount ? { questionAccountId: questionAccount.id } : {}),
        questionSummaries,
        probesToWrite,
      });
      addCounts(reports, merged.addedBySource);
      return { sources: reports, pool: merged.pool };
    },

    listCandidates(filter) {
      return app.store.transaction(() =>
        sortCandidates(
          app.store.candidates.list(
            filter?.state === undefined
              ? { state: ["new"] }
              : { state: filter.state },
          ),
        ),
      );
    },

    skipCandidates(ids) {
      const { at } = nowParts(app);
      return app.store.transaction(() => {
        const candidates = app.store.candidates.list({ state: ["new"] });
        const selected =
          ids === "rest"
            ? candidates
            : (() => {
                if (new Set(ids).size !== ids.length)
                  throw new LeafPressError("USAGE", "候选编号不能重复");
                const byId = new Map(
                  candidates.map((candidate) => [candidate.id, candidate]),
                );
                const missing = ids.filter((id) => !byId.has(id));
                if (missing.length)
                  throw new LeafPressError(
                    "USAGE",
                    missing.map((id) => `候选 ${id} 不在池里`).join("\n"),
                  );
                return ids.map((id) => byId.get(id)!);
              })();
        const skipped = selected.map((candidate) => ({
          ...candidate,
          state: "skipped" as const,
          updatedAt: at,
        }));
        for (const candidate of skipped) app.store.candidates.update(candidate);
        return sortCandidates(skipped);
      });
    },
  };
}
