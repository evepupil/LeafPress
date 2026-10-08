import type { FeedbackEntry, Work, WorkLog, WorkTotals } from "@leafpress/core";

import {
  decodeJson,
  optionalString,
  requiredNumber,
  requiredString,
  storeFailed,
  type SqlRow,
} from "./sql.js";

export function mapWork(
  row: SqlRow,
  logs: readonly SqlRow[],
  feedback: readonly SqlRow[],
): Work {
  const kind = requiredString(row, "source_kind", "works");
  const sourceId = optionalString(row, "source_id", "works");
  let source: Work["source"];
  if (kind === "idea" && sourceId !== undefined)
    source = { kind, ideaId: sourceId };
  else if (kind === "work" && sourceId !== undefined)
    source = { kind, workId: sourceId };
  else if (kind === "import" && sourceId === undefined) source = { kind };
  else if (kind === "none" && sourceId === undefined) source = { kind };
  else
    throw storeFailed(
      "记录库表「works」列「source_kind、source_id」的来源格式无效。",
    );

  const totalsValue = decodeJson<unknown>(row.totals, "works", "totals");
  const totals =
    totalsValue === undefined ? undefined : parseTotals(totalsValue);
  const tagsValue = decodeJson<unknown>(row.tags, "works", "tags");
  const tags = parseTags(tagsValue);
  const leaseSince = optionalString(row, "lease_since", "works");
  const leaseExpiresAt = optionalString(row, "lease_expires_at", "works");

  return {
    id: requiredString(row, "id", "works"),
    title: requiredString(row, "title", "works"),
    accountId: requiredString(row, "account_id", "works"),
    status: requiredString(row, "status", "works") as Work["status"],
    brief: requiredString(row, "brief", "works"),
    source,
    workflowId: requiredString(row, "workflow_id", "works"),
    step: requiredNumber(row, "step", "works"),
    ...(optionalString(row, "ask", "works") === undefined
      ? {}
      : { ask: optionalString(row, "ask", "works") }),
    ...(optionalString(row, "feedback", "works") === undefined
      ? {}
      : { feedback: optionalString(row, "feedback", "works") }),
    feedbackHistory: feedback.map(mapFeedback),
    order: requiredNumber(row, "ord", "works"),
    createdAt: requiredString(row, "created_at", "works"),
    updatedAt: requiredString(row, "updated_at", "works"),
    ...(optionalString(row, "url", "works") === undefined
      ? {}
      : { url: optionalString(row, "url", "works") }),
    ...(optionalString(row, "published_at", "works") === undefined
      ? {}
      : { publishedAt: optionalString(row, "published_at", "works") }),
    ...(totals === undefined ? {} : { totals }),
    ...(optionalString(row, "totals_day", "works") === undefined
      ? {}
      : { totalsDay: optionalString(row, "totals_day", "works") }),
    ...(optionalString(row, "question", "works") === undefined
      ? {}
      : { question: optionalString(row, "question", "works") }),
    ...(optionalString(row, "local_path", "works") === undefined
      ? {}
      : { localPath: optionalString(row, "local_path", "works") }),
    ...(optionalString(row, "source_ref", "works") === undefined
      ? {}
      : { sourceRef: optionalString(row, "source_ref", "works") }),
    tags,
    ...(leaseSince === undefined || leaseExpiresAt === undefined
      ? {}
      : { lease: { since: leaseSince, expiresAt: leaseExpiresAt } }),
    ...(optionalString(row, "error", "works") === undefined
      ? {}
      : { error: optionalString(row, "error", "works") }),
    log: logs.map(mapLog),
  };
}

function mapLog(row: SqlRow): WorkLog {
  return {
    at: requiredString(row, "at", "work_logs"),
    text: requiredString(row, "text", "work_logs"),
  };
}

function mapFeedback(row: SqlRow): FeedbackEntry {
  return {
    at: requiredString(row, "at", "work_feedback"),
    step: requiredNumber(row, "step", "work_feedback"),
    stepName: requiredString(row, "step_name", "work_feedback"),
    text: requiredString(row, "text", "work_feedback"),
  };
}

function parseTotals(value: unknown): WorkTotals {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw storeFailed("记录库表「works」JSON 列「totals」不是数值映射。");
  }
  const totals: WorkTotals = {};
  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount !== "number" || !Number.isFinite(amount))
      throw storeFailed("记录库表「works」JSON 列「totals」不是数值映射。");
    totals[key] = amount;
  }
  return totals;
}

function parseTags(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw storeFailed("记录库表「works」JSON 列「tags」不是文本数组。");
  }
  return value;
}
