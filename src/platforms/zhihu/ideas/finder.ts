import { relatedWorkIds } from "@leafpress/core";
import type { QuestionVia } from "@leafpress/core";

import { createZhihuClient, type ZhihuClient } from "../api/client.js";
import {
  ZhihuApiError,
  ZhihuAuthenticationError,
  ZhihuRateLimitError,
} from "../api/errors.js";
import {
  answerSummaries,
  hotQuestions,
  recommendQuestions,
  searchQuestions,
  type ZhihuQuestionItem,
} from "./api.js";
import type {
  FoundQuestion,
  QuestionFinder,
  QuestionFinderContext,
  QuestionFinderOutcome,
  QuestionFinderStage,
  QuestionSummaryContext,
  QuestionSummaryOutcome,
} from "../../types.js";

const SETUP_HINT = "在接入里填上开放平台的 Access Secret";
const REGENERATE_HINT =
  "在知乎开放平台个人中心重新生成 Access Secret，填到接入里";
const DISCOVERY_QUOTA_WARNING = "今天问题发现的额度用完了";
const SUMMARY_QUOTA_WARNING = "今天问题发现的额度用完了，只补了";
const VIA_ORDER: QuestionVia[] = ["personal", "topic", "blog", "hot"];

function warningText(error: unknown): string {
  return error instanceof Error ? error.message : "知乎问题发现失败";
}

function isDiscoveryQuotaError(error: unknown): boolean {
  return (
    error instanceof ZhihuApiError &&
    !(error instanceof ZhihuRateLimitError) &&
    error.code === 30001
  );
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function stageOf(
  stage: QuestionFinderStage["stage"],
  found: number,
  warnings: string[],
): QuestionFinderStage {
  return {
    stage,
    found,
    ...(warnings.length === 0 ? {} : { warning: warnings.join("；") }),
  };
}

export function createZhihuQuestionFinder(): QuestionFinder {
  return {
    async find(ctx: QuestionFinderContext): Promise<QuestionFinderOutcome> {
      const secret = ctx.secret("access-secret")?.trim();
      if (!secret)
        return {
          ok: false,
          reason: "知乎账号还没填开放平台密钥",
          fixHint: SETUP_HINT,
        };

      const client: ZhihuClient = createZhihuClient({
        secret,
        fetch: ctx.fetch,
        ...(ctx.sleep === undefined
          ? {}
          : {
              sleep: async (ms: number) => {
                await ctx.sleep?.(ms);
              },
            }),
      });
      const merged = new Map<string, FoundQuestion>();
      let discoveryQuotaExhausted = false;

      function merge(
        item: ZhihuQuestionItem,
        via: QuestionVia,
        topics: readonly string[] = [],
        blogWorkIds: readonly string[] = [],
      ): void {
        let question = merged.get(item.questionId);
        if (!question) {
          question = {
            questionId: item.questionId,
            title: item.title,
            url: item.url,
            via: [],
            topics: [],
            blogWorkIds: [],
            answerSummaries: [],
          };
          merged.set(item.questionId, question);
        } else if (!question.title && item.title) {
          question.title = item.title;
        }

        if (!question.via.includes(via)) question.via.push(via);
        for (const topic of topics)
          if (!question.topics.includes(topic)) question.topics.push(topic);
        for (const workId of blogWorkIds)
          if (!question.blogWorkIds.includes(workId))
            question.blogWorkIds.push(workId);
      }

      async function attempt<T>(
        operation: () => Promise<T>,
        warnings: string[],
        usesDiscoveryQuota: boolean,
      ): Promise<T | undefined> {
        try {
          return await operation();
        } catch (error) {
          if (error instanceof ZhihuAuthenticationError) throw error;
          if (usesDiscoveryQuota && isDiscoveryQuotaError(error)) {
            discoveryQuotaExhausted = true;
            addWarning(warnings, DISCOVERY_QUOTA_WARNING);
          } else {
            addWarning(warnings, warningText(error));
          }
          return undefined;
        }
      }

      try {
        const stages: QuestionFinderStage[] = [];

        ctx.progress?.("知乎问题：个性化推荐");
        const personalWarnings: string[] = [];
        const personalIds = new Set<string>();
        const personal = await attempt(
          () => recommendQuestions(client, { count: 20 }),
          personalWarnings,
          true,
        );
        for (const item of personal ?? []) {
          personalIds.add(item.questionId);
          merge(item, "personal");
        }
        stages.push(stageOf("personal", personalIds.size, personalWarnings));

        ctx.progress?.("知乎问题：主题推荐");
        const topicWarnings: string[] = [];
        const topicIds = new Set<string>();
        const topics = ctx.topics.filter((topic) => topic.trim() !== "");
        for (const topic of topics) {
          if (discoveryQuotaExhausted) {
            addWarning(topicWarnings, DISCOVERY_QUOTA_WARNING);
            break;
          }
          const found = await attempt(
            () => recommendQuestions(client, { query: topic, count: 10 }),
            topicWarnings,
            true,
          );
          for (const item of found ?? []) {
            topicIds.add(item.questionId);
            merge(item, "topic", [topic]);
          }
        }
        stages.push(stageOf("topic", topicIds.size, topicWarnings));

        ctx.progress?.("知乎问题：博客反找");
        const blogWarnings: string[] = [];
        const blogIds = new Set<string>();
        for (const blog of ctx.blogs) {
          const relatedBlog = [{ id: blog.workId, title: blog.title }];
          if (discoveryQuotaExhausted)
            addWarning(blogWarnings, DISCOVERY_QUOTA_WARNING);
          else {
            const recommended = await attempt(
              () => recommendQuestions(client, { query: blog.title, count: 5 }),
              blogWarnings,
              true,
            );
            for (const item of recommended ?? []) {
              if (relatedWorkIds(item.title, relatedBlog).length === 0)
                continue;
              blogIds.add(item.questionId);
              merge(item, "blog", [], [blog.workId]);
            }
          }

          // 搜索走独立额度，即使问题发现额度耗尽也继续反找博客标题。
          const searched = await attempt(
            () => searchQuestions(client, blog.title),
            blogWarnings,
            false,
          );
          // 两条反找路径的噪音都要按共享标题相关性规则过滤。
          for (const item of searched ?? []) {
            if (relatedWorkIds(item.title, relatedBlog).length === 0) continue;
            blogIds.add(item.questionId);
            merge(item, "blog", [], [blog.workId]);
          }
        }
        stages.push(stageOf("blog", blogIds.size, blogWarnings));

        ctx.progress?.("知乎问题：热榜");
        const hotWarnings: string[] = [];
        const hotIds = new Set<string>();
        if (topics.length > 0) {
          const hot = await attempt(
            () => hotQuestions(client),
            hotWarnings,
            false,
          );
          for (const item of hot ?? []) {
            const matchedTopics = topics.filter((topic) =>
              item.title.toLowerCase().includes(topic.toLowerCase()),
            );
            if (matchedTopics.length === 0) continue;
            hotIds.add(item.questionId);
            merge(item, "hot", matchedTopics);
          }
        }
        stages.push(stageOf("hot", hotIds.size, hotWarnings));

        const questions = [...merged.values()].filter(
          (question) => !ctx.skipQuestionIds.has(question.questionId),
        );
        for (const question of questions)
          question.via.sort(
            (left, right) => VIA_ORDER.indexOf(left) - VIA_ORDER.indexOf(right),
          );
        return { ok: true, questions, stages };
      } catch (error) {
        if (error instanceof ZhihuAuthenticationError)
          return {
            ok: false,
            reason: error.message,
            fixHint: REGENERATE_HINT,
            expiredKey: "access-secret",
          };
        throw error;
      }
    },

    async summarize(
      ctx: QuestionSummaryContext,
      questions,
    ): Promise<QuestionSummaryOutcome> {
      const secret = ctx.secret("access-secret")?.trim();
      if (!secret)
        return {
          ok: false,
          reason: "知乎账号还没填开放平台密钥",
          fixHint: SETUP_HINT,
        };

      const client: ZhihuClient = createZhihuClient({
        secret,
        fetch: ctx.fetch,
        ...(ctx.sleep === undefined
          ? {}
          : {
              sleep: async (ms: number) => {
                await ctx.sleep?.(ms);
              },
            }),
      });
      const summaries = new Map<string, string[]>();
      const warnings: string[] = [];
      let summarized = 0;

      ctx.progress?.("知乎问题：补回答摘要");
      for (const question of questions) {
        try {
          const found = (await answerSummaries(client, question.url, 3)).slice(
            0,
            3,
          );
          if (found.length > 0) {
            summaries.set(question.questionId, found);
            summarized += 1;
          }
        } catch (error) {
          if (error instanceof ZhihuAuthenticationError)
            return {
              ok: false,
              reason: error.message,
              fixHint: REGENERATE_HINT,
              expiredKey: "access-secret",
            };
          if (isDiscoveryQuotaError(error)) {
            addWarning(warnings, `${SUMMARY_QUOTA_WARNING} ${summarized} 个`);
            break;
          }
          addWarning(warnings, warningText(error));
        }
      }

      return {
        ok: true,
        summaries,
        ...(warnings.length === 0 ? {} : { warning: warnings.join("；") }),
      };
    },
  };
}
