import type { Idea, IdeaSource, IdeaStatus } from "@leafpress/core";

import type { IdeasRepo } from "./types.js";

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

const IDEA_COLUMNS =
  "id, text, detail, status, source, source_detail, account_id, ord, created_at, updated_at";

export function createIdeasRepo(context: RepoContext): IdeasRepo {
  const mapRow = (row: SqlRow, workIds: string[] = []): Idea => ({
    id: requiredString(row, "id", "ideas"),
    text: requiredString(row, "text", "ideas"),
    detail: requiredString(row, "detail", "ideas"),
    status: requiredString(row, "status", "ideas") as IdeaStatus,
    source: requiredString(row, "source", "ideas") as IdeaSource,
    ...(optionalString(row, "source_detail", "ideas") === undefined
      ? {}
      : { sourceDetail: optionalString(row, "source_detail", "ideas") }),
    ...(optionalString(row, "account_id", "ideas") === undefined
      ? {}
      : { accountId: optionalString(row, "account_id", "ideas") }),
    order: requiredNumber(row, "ord", "ideas"),
    createdAt: requiredString(row, "created_at", "ideas"),
    updatedAt: requiredString(row, "updated_at", "ideas"),
    workIds,
  });

  function values(idea: Idea): readonly (string | number | null)[] {
    return [
      idea.id,
      idea.text,
      idea.detail,
      idea.status,
      idea.source,
      idea.sourceDetail ?? null,
      idea.accountId ?? null,
      idea.order,
      idea.createdAt,
      idea.updatedAt,
    ];
  }

  function withWorkIds(): Idea[] {
    const ideas = context.db
      .prepare(`SELECT ${IDEA_COLUMNS} FROM ideas ORDER BY created_at, id`)
      .all();
    const works = context.db
      .prepare(
        "SELECT source_id, id FROM works WHERE source_kind = 'idea' ORDER BY created_at, id",
      )
      .all();
    const idsByIdea = new Map<string, string[]>();
    for (const raw of works) {
      const row = raw;
      const ideaId = optionalString(row, "source_id", "works");
      const workId = requiredString(row, "id", "works");
      if (ideaId === undefined) continue;
      const ids = idsByIdea.get(ideaId) ?? [];
      ids.push(workId);
      idsByIdea.set(ideaId, ids);
    }
    return ideas.map((row) => {
      const idea = mapRow(row);
      return { ...idea, workIds: idsByIdea.get(idea.id) ?? [] };
    });
  }

  return {
    list() {
      return readRepo(
        "ideas、works",
        "ideas.id, ideas.created_at, works.source_kind, works.source_id",
        () => context.withReadTransaction(withWorkIds),
      );
    },
    get(id) {
      return readRepo(
        "ideas, works",
        `${IDEA_COLUMNS}, works.source_kind, works.source_id`,
        () =>
          context.withReadTransaction(() => {
            const row = context.db
              .prepare(`SELECT ${IDEA_COLUMNS} FROM ideas WHERE id = ?`)
              .get(id);
            if (row === undefined) return undefined;
            const idea = mapRow(row);
            const works = context.db
              .prepare(
                "SELECT id FROM works WHERE source_kind = 'idea' AND source_id = ? ORDER BY created_at, id",
              )
              .all(id);
            return {
              ...idea,
              workIds: works.map((work) => requiredString(work, "id", "works")),
            };
          }),
      );
    },
    insert(idea) {
      writeRepo(context, "ideas", IDEA_COLUMNS, () => {
        context.db
          .prepare(
            `INSERT INTO ideas (${IDEA_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(...values(idea));
      });
    },
    update(idea) {
      writeRepo(context, "ideas", IDEA_COLUMNS, () => {
        const result = context.db
          .prepare(
            `UPDATE ideas SET text = ?, detail = ?, status = ?, source = ?, source_detail = ?, account_id = ?, ord = ?, created_at = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            idea.text,
            idea.detail,
            idea.status,
            idea.source,
            idea.sourceDetail ?? null,
            idea.accountId ?? null,
            idea.order,
            idea.createdAt,
            idea.updatedAt,
            idea.id,
          );
        ensureUpdated(result, "ideas", "id");
      });
    },
    remove(id) {
      writeRepo(context, "ideas", "id", () => {
        context.db.prepare("DELETE FROM ideas WHERE id = ?").run(id);
      });
    },
  };
}
