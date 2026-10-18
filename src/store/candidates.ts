import type {
  CandidateKind,
  CandidatePayload,
  CandidateState,
  IdeaCandidate,
  PlatformId,
  QuestionVia,
} from "@leafpress/core";

import type { IdeaCandidatesRepo } from "./types.js";
import {
  ensureUpdated,
  optionalString,
  readRepo,
  requiredNumber,
  requiredString,
  writeRepo,
  type RepoContext,
  type SqlRow,
} from "./repo-common.js";
import {
  decodeJson,
  encodeJson,
  storeFailed,
  validateFiniteNumber,
} from "./sql.js";

const CANDIDATE_COLUMNS =
  "id, key, kind, title, url, account_id, score, state, idea_id, payload, first_seen_at, updated_at";

const KIND_ORDER = `CASE kind
  WHEN 'question' THEN 0
  WHEN 'followup' THEN 1
  WHEN 'devlog' THEN 2
  ELSE 3
END`;

export function createIdeaCandidatesRepo(
  context: RepoContext,
): IdeaCandidatesRepo {
  function mapRow(row: SqlRow): IdeaCandidate {
    const kind = parseKind(requiredString(row, "kind", "idea_candidates"));
    const state = parseState(requiredString(row, "state", "idea_candidates"));
    const payloadValue = decodeJson<unknown>(
      row.payload,
      "idea_candidates",
      "payload",
    );
    const score = requiredNumber(row, "score", "idea_candidates");
    validateFiniteNumber(score, "idea_candidates", "score");
    const url = optionalString(row, "url", "idea_candidates");
    const accountId = optionalString(row, "account_id", "idea_candidates");
    const ideaId = optionalString(row, "idea_id", "idea_candidates");

    return {
      id: requiredString(row, "id", "idea_candidates"),
      key: requiredString(row, "key", "idea_candidates"),
      kind,
      title: requiredString(row, "title", "idea_candidates"),
      ...(url === undefined ? {} : { url }),
      ...(accountId === undefined ? {} : { accountId }),
      score,
      state,
      ...(ideaId === undefined ? {} : { ideaId }),
      payload: parsePayload(payloadValue, kind),
      firstSeenAt: requiredString(row, "first_seen_at", "idea_candidates"),
      updatedAt: requiredString(row, "updated_at", "idea_candidates"),
    };
  }

  function writeValues(candidate: IdeaCandidate) {
    const kind = parseKind(candidate.kind);
    const state = parseState(candidate.state);
    const payload = parsePayload(candidate.payload, kind);
    validateFiniteNumber(candidate.score, "idea_candidates", "score");
    return {
      id: candidate.id,
      key: candidate.key,
      kind,
      title: candidate.title,
      url: candidate.url ?? null,
      accountId: candidate.accountId ?? null,
      score: candidate.score,
      state,
      ideaId: candidate.ideaId ?? null,
      payload: encodeJson(payload, "idea_candidates", "payload"),
      firstSeenAt: candidate.firstSeenAt,
      updatedAt: candidate.updatedAt,
    };
  }

  function values(
    candidate: IdeaCandidate,
  ): readonly (string | number | null)[] {
    const row = writeValues(candidate);
    return [
      row.id,
      row.key,
      row.kind,
      row.title,
      row.url,
      row.accountId,
      row.score,
      row.state,
      row.ideaId,
      row.payload,
      row.firstSeenAt,
      row.updatedAt,
    ];
  }

  function readOne(
    column: "id" | "key" | "idea_id",
    value: string,
  ): IdeaCandidate | undefined {
    const row = context.db
      .prepare(
        `SELECT ${CANDIDATE_COLUMNS} FROM idea_candidates WHERE ${column} = ?`,
      )
      .get(value);
    return row === undefined ? undefined : mapRow(row);
  }

  return {
    list(filter) {
      return readRepo("idea_candidates", CANDIDATE_COLUMNS, () => {
        const states = filter?.state;
        if (states !== undefined && states.length === 0) return [];
        const where =
          states === undefined
            ? ""
            : ` WHERE state IN (${states.map(() => "?").join(", ")})`;
        const rows = context.db
          .prepare(
            `SELECT ${CANDIDATE_COLUMNS} FROM idea_candidates${where} ORDER BY ${KIND_ORDER}, score DESC, id`,
          )
          .all(...(states ?? []));
        return rows.map((row) => mapRow(row));
      });
    },
    get(id) {
      return readRepo("idea_candidates", CANDIDATE_COLUMNS, () =>
        readOne("id", id),
      );
    },
    getByKey(key) {
      return readRepo("idea_candidates", CANDIDATE_COLUMNS, () =>
        readOne("key", key),
      );
    },
    getByIdea(ideaId) {
      return readRepo("idea_candidates", CANDIDATE_COLUMNS, () =>
        readOne("idea_id", ideaId),
      );
    },
    insert(candidate) {
      writeRepo(context, "idea_candidates", CANDIDATE_COLUMNS, () => {
        context.db
          .prepare(
            `INSERT INTO idea_candidates (${CANDIDATE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(...values(candidate));
      });
    },
    update(candidate) {
      writeRepo(context, "idea_candidates", CANDIDATE_COLUMNS, () => {
        const row = writeValues(candidate);
        const result = context.db
          .prepare(
            `UPDATE idea_candidates SET kind = ?, title = ?, url = ?, account_id = ?, score = ?, state = ?, idea_id = ?, payload = ?, first_seen_at = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            row.kind,
            row.title,
            row.url,
            row.accountId,
            row.score,
            row.state,
            row.ideaId,
            row.payload,
            row.firstSeenAt,
            row.updatedAt,
            row.id,
          );
        ensureUpdated(result, "idea_candidates", "id");
      });
    },
    remove(id) {
      context.withTransaction(() => {
        const existing = readRepo("idea_candidates", "id", () =>
          context.db
            .prepare("SELECT 1 FROM idea_candidates WHERE id = ?")
            .get(id),
        );
        if (existing === undefined) return;

        writeRepo(context, "idea_candidates", "id", () => {
          context.db
            .prepare("DELETE FROM idea_candidates WHERE id = ?")
            .run(id);
        });
      });
    },
  };
}

function parseKind(value: string): CandidateKind {
  if (value === "question" || value === "followup" || value === "devlog")
    return value;
  throw storeFailed("记录库表「idea_candidates」列「kind」无效。");
}

function parseState(value: string): CandidateState {
  if (
    value === "new" ||
    value === "suggested" ||
    value === "skipped" ||
    value === "rejected"
  ) {
    return value;
  }
  throw storeFailed("记录库表「idea_candidates」列「state」无效。");
}

function parsePayload(value: unknown, kind: CandidateKind): CandidatePayload {
  // payload 和独立 kind 列必须一致，避免损坏记录被当作另一类候选使用。
  if (!isRecord(value) || value.kind !== kind) {
    throw storeFailed(
      "记录库表「idea_candidates」JSON 列「payload」格式无效。",
    );
  }

  switch (kind) {
    case "question":
      return {
        kind,
        questionId: payloadString(value.questionId, "questionId"),
        via: parseVia(value.via),
        topics: payloadStringArray(value.topics, "topics"),
        blogWorkIds: payloadStringArray(value.blogWorkIds, "blogWorkIds"),
        answerSummaries: payloadStringArray(
          value.answerSummaries,
          "answerSummaries",
        ),
        relatedWorkIds: payloadStringArray(
          value.relatedWorkIds,
          "relatedWorkIds",
        ),
      };
    case "followup": {
      const publishedAt = value.publishedAt;
      if (publishedAt !== undefined && typeof publishedAt !== "string")
        throw invalidPayload("publishedAt");
      const interactions = value.interactions;
      if (
        interactions !== null &&
        (typeof interactions !== "number" || !Number.isFinite(interactions))
      ) {
        throw invalidPayload("interactions");
      }
      const platform = parsePlatform(value.platform);
      const reach = payloadNumber(value.reach, "reach");
      const growth = payloadNumber(value.growth, "growth");
      return {
        kind,
        workId: payloadString(value.workId, "workId"),
        platform,
        ...(publishedAt === undefined ? {} : { publishedAt }),
        reach,
        growth,
        interactions,
      };
    }
    case "devlog":
      return {
        kind,
        repo: payloadString(value.repo, "repo"),
        path: payloadString(value.path, "path"),
        week: payloadString(value.week, "week"),
        commits: payloadStringArray(value.commits, "commits"),
        logs: parseLogs(value.logs),
      };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadString(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalidPayload(field);
  return value;
}

function payloadStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw invalidPayload(field);
  return value;
}

function payloadNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw invalidPayload(field);
  return value;
}

function parseVia(value: unknown): QuestionVia[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item): item is QuestionVia =>
        item === "personal" ||
        item === "topic" ||
        item === "blog" ||
        item === "hot",
    )
  ) {
    throw invalidPayload("via");
  }
  return value;
}

function parsePlatform(value: unknown): PlatformId {
  if (
    value === "blog" ||
    value === "zhihu" ||
    value === "bilibili" ||
    value === "xiaohongshu"
  ) {
    return value;
  }
  throw invalidPayload("platform");
}

function parseLogs(value: unknown): { file: string; headings: string[] }[] {
  if (!Array.isArray(value)) throw invalidPayload("logs");
  return value.map((item) => {
    if (!isRecord(item)) throw invalidPayload("logs");
    return {
      file: payloadString(item.file, "logs.file"),
      headings: payloadStringArray(item.headings, "logs.headings"),
    };
  });
}

function invalidPayload(field: string): ReturnType<typeof storeFailed> {
  return storeFailed(
    `记录库表「idea_candidates」JSON 列「payload」字段「${field}」无效。`,
  );
}
