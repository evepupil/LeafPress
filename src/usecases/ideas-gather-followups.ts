import {
  addDays,
  followupKey,
  isBlocked,
  scoreFollowup,
  secondaryOf,
  topWorks,
  type Account,
  type FollowupPayload,
  type IdeaCandidate,
  type MetricsDataset,
  type Work,
} from "@leafpress/core";
import type { PlatformInfo } from "@leafpress/core";

export type FollowupDraft = Omit<
  IdeaCandidate,
  "id" | "firstSeenAt" | "updatedAt" | "state"
>;

/** 数据排行只接受已写发布日期、有 totals 的作品；这里补上默认值以便统一筛选。 */
export function findFollowupDrafts(input: {
  today: string;
  accounts: Account[];
  works: Work[];
  candidates: IdeaCandidate[];
  dataset: MetricsDataset;
  catalog: Record<Account["platform"], PlatformInfo>;
}): FollowupDraft[] {
  const accounts = new Map(
    input.accounts.map((account) => [account.id, account]),
  );
  const candidates = new Map(
    input.candidates.map((candidate) => [candidate.key, candidate]),
  );
  const cutoff = addDays(input.today, -7);
  const eligible = input.works.flatMap((work) => {
    const account = accounts.get(work.accountId);
    if (
      work.status !== "done" ||
      !work.url ||
      (work.publishedAt !== undefined && work.publishedAt >= cutoff) ||
      isBlocked(
        candidates.get(followupKey(work.id)),
        `${input.today}T00:00:00+08:00`,
      ) ||
      !account
    )
      return [];
    return [{ work, account }];
  });
  const rankedWorks = eligible.map(({ work, account }) => {
    const primaryKey = input.catalog[account.platform].metrics[0]?.key;
    return {
      ...work,
      publishedAt: work.publishedAt ?? addDays(input.today, -8),
      totals:
        work.totals ?? (primaryKey === undefined ? {} : { [primaryKey]: 0 }),
    };
  });
  const metricsInput = {
    dataset: input.dataset,
    accounts: input.accounts,
    works: rankedWorks,
  };
  const originalById = new Map(eligible.map(({ work }) => [work.id, work]));
  const growthRanked = topWorks(metricsInput, "growth", eligible.length);
  const selected = growthRanked
    .filter((ranked) => ranked.growth > 0)
    .slice(0, 3);

  return selected.flatMap((ranked) => {
    const work = originalById.get(ranked.work.id);
    const account = work && accounts.get(work.accountId);
    if (!work || !account) return [];
    const interactions =
      secondaryOf(input.catalog[account.platform]).kind === "interactions"
        ? ranked.interactions
        : null;
    const payload: FollowupPayload = {
      kind: "followup",
      workId: work.id,
      platform: account.platform,
      ...(work.publishedAt === undefined
        ? {}
        : { publishedAt: work.publishedAt }),
      reach: ranked.reach,
      growth: ranked.growth,
      interactions,
    };
    return [
      {
        key: `wf:${work.id}`,
        kind: "followup" as const,
        title: work.title,
        ...(work.url === undefined ? {} : { url: work.url }),
        score: scoreFollowup(payload),
        payload,
      },
    ];
  });
}
