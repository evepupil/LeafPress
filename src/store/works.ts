import type { FeedbackEntry, Work, WorkLog } from "@leafpress/core";

import {
  encodeJson,
  optionalString,
  requiredNumber,
  requiredString,
  validateFiniteNumbers,
  type SqlRow,
} from "./sql.js";
import { mapWork } from "./works-mapping.js";
import type { WorksRepo } from "./types.js";
import {
  ensureUpdated,
  readRepo,
  writeRepo,
  type RepoContext,
} from "./repo-common.js";

const WORK_COLUMNS =
  "id, title, account_id, status, brief, source_kind, source_id, workflow_id, step, ask, feedback, ord, url, published_at, totals, totals_day, question, local_path, source_ref, tags, lease_token, lease_since, lease_expires_at, error, created_at, updated_at";
const WORK_MESSAGE_COLUMNS =
  "works fields, lease_token, work_logs.at/text, work_feedback.at/step/step_name/text";

export function createWorksRepo(context: RepoContext): WorksRepo {
  function mapChildren(workId: string): { logs: SqlRow[]; feedback: SqlRow[] } {
    const logs = context.db
      .prepare("SELECT at, text FROM work_logs WHERE work_id = ? ORDER BY id")
      .all(workId) as SqlRow[];
    const feedback = context.db
      .prepare(
        "SELECT at, step, step_name, text FROM work_feedback WHERE work_id = ? ORDER BY id",
      )
      .all(workId) as SqlRow[];
    return { logs, feedback };
  }

  function appendLogs(workId: string, logs: readonly WorkLog[]): void {
    const row = context.db
      .prepare("SELECT COUNT(*) AS count FROM work_logs WHERE work_id = ?")
      .get(workId) as SqlRow;
    const count = requiredNumber(row, "count", "work_logs");
    const insert = context.db.prepare(
      "INSERT INTO work_logs (work_id, at, text) VALUES (?, ?, ?)",
    );
    for (const log of logs.slice(count)) insert.run(workId, log.at, log.text);
  }

  function appendFeedback(
    workId: string,
    entries: readonly FeedbackEntry[],
  ): void {
    const row = context.db
      .prepare("SELECT COUNT(*) AS count FROM work_feedback WHERE work_id = ?")
      .get(workId) as SqlRow;
    const count = requiredNumber(row, "count", "work_feedback");
    const insert = context.db.prepare(
      "INSERT INTO work_feedback (work_id, at, step, step_name, text) VALUES (?, ?, ?, ?, ?)",
    );
    for (const entry of entries.slice(count))
      insert.run(workId, entry.at, entry.step, entry.stepName, entry.text);
  }

  function insertWork(work: Work, token: string | null): void {
    const sourceId =
      work.source.kind === "idea"
        ? work.source.ideaId
        : work.source.kind === "work"
          ? work.source.workId
          : null;
    context.db
      .prepare(
        `INSERT INTO works (${WORK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        work.id,
        work.title,
        work.accountId,
        work.status,
        work.brief,
        work.source.kind,
        sourceId,
        work.workflowId,
        work.step,
        work.ask ?? null,
        work.feedback ?? null,
        work.order,
        work.url ?? null,
        work.publishedAt ?? null,
        work.totals === undefined ? null : encodeTotals(work.totals),
        work.totalsDay ?? null,
        work.question ?? null,
        work.localPath ?? null,
        work.sourceRef ?? null,
        encodeJson(work.tags, "works", "tags"),
        token,
        work.lease?.since ?? null,
        work.lease?.expiresAt ?? null,
        work.error ?? null,
        work.createdAt,
        work.updatedAt,
      );
    appendLogs(work.id, work.log);
    appendFeedback(work.id, work.feedbackHistory);
  }

  function updateWork(
    work: Work,
    lease: { token: string } | null | undefined,
  ): void {
    const sourceId =
      work.source.kind === "idea"
        ? work.source.ideaId
        : work.source.kind === "work"
          ? work.source.workId
          : null;
    const tokenIsSet = work.lease === undefined || lease !== undefined;
    const tokenValue =
      work.lease === undefined || lease === null
        ? null
        : (lease?.token ?? null);
    const totals = work.totals === undefined ? null : encodeTotals(work.totals);
    const result = context.db
      .prepare(
        `UPDATE works SET title = ?, account_id = ?, status = ?, brief = ?, source_kind = ?, source_id = ?, workflow_id = ?, step = ?, ask = ?, feedback = ?, ord = ?, url = ?, published_at = ?, totals = ?, totals_day = ?, question = ?, local_path = ?, source_ref = ?, tags = ?, lease_token = CASE WHEN ? = 1 THEN ? ELSE lease_token END, lease_since = ?, lease_expires_at = ?, error = ?, created_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        work.title,
        work.accountId,
        work.status,
        work.brief,
        work.source.kind,
        sourceId,
        work.workflowId,
        work.step,
        work.ask ?? null,
        work.feedback ?? null,
        work.order,
        work.url ?? null,
        work.publishedAt ?? null,
        totals,
        work.totalsDay ?? null,
        work.question ?? null,
        work.localPath ?? null,
        work.sourceRef ?? null,
        encodeJson(work.tags, "works", "tags"),
        tokenIsSet ? 1 : 0,
        tokenValue,
        work.lease?.since ?? null,
        work.lease?.expiresAt ?? null,
        work.error ?? null,
        work.createdAt,
        work.updatedAt,
        work.id,
      );
    ensureUpdated(result, "works", "id");
    appendLogs(work.id, work.log);
    appendFeedback(work.id, work.feedbackHistory);
  }

  return {
    list() {
      return readRepo(
        "works, work_logs, work_feedback",
        WORK_MESSAGE_COLUMNS,
        () =>
          context.withReadTransaction(() => {
            const rows = context.db
              .prepare(`SELECT ${WORK_COLUMNS} FROM works ORDER BY ord, id`)
              .all();
            const logs = context.db
              .prepare(
                "SELECT work_id, at, text FROM work_logs ORDER BY work_id, id",
              )
              .all();
            const feedback = context.db
              .prepare(
                "SELECT work_id, at, step, step_name, text FROM work_feedback ORDER BY work_id, id",
              )
              .all();
            const logsByWork = groupChildren(logs, "work_logs");
            const feedbackByWork = groupChildren(feedback, "work_feedback");
            return rows.map((row) => {
              const id = requiredString(row, "id", "works");
              return mapWork(
                row,
                logsByWork.get(id) ?? [],
                feedbackByWork.get(id) ?? [],
              );
            });
          }),
      );
    },
    get(id) {
      return readRepo(
        "works, work_logs, work_feedback",
        WORK_MESSAGE_COLUMNS,
        () =>
          context.withReadTransaction(() => {
            const row = context.db
              .prepare(`SELECT ${WORK_COLUMNS} FROM works WHERE id = ?`)
              .get(id);
            if (row === undefined) return undefined;
            const children = mapChildren(id);
            return mapWork(row, children.logs, children.feedback);
          }),
      );
    },
    insert(work, lease) {
      writeRepo(
        context,
        "works, work_logs, work_feedback",
        WORK_MESSAGE_COLUMNS,
        () => {
          insertWork(
            work,
            work.lease === undefined ? null : (lease?.token ?? null),
          );
        },
      );
    },
    update(work, lease) {
      writeRepo(
        context,
        "works, work_logs, work_feedback",
        WORK_MESSAGE_COLUMNS,
        () => updateWork(work, lease),
      );
    },
    leaseToken(id) {
      return readRepo("works", "id, lease_token", () => {
        const row = context.db
          .prepare("SELECT lease_token FROM works WHERE id = ?")
          .get(id);
        if (row === undefined) return undefined;
        return optionalString(row, "lease_token", "works");
      });
    },
    remove(id) {
      writeRepo(
        context,
        "works, work_logs, work_feedback, work_snapshots",
        "id, work_id",
        () => {
          context.db.prepare("DELETE FROM works WHERE id = ?").run(id);
        },
      );
    },
  };
}

function encodeTotals(totals: NonNullable<Work["totals"]>): string {
  validateFiniteNumbers(totals, "works", "totals");
  return encodeJson(totals, "works", "totals");
}

function groupChildren(
  rows: readonly SqlRow[],
  table: "work_logs" | "work_feedback",
): Map<string, SqlRow[]> {
  const groups = new Map<string, SqlRow[]>();
  for (const row of rows) {
    const workId = requiredString(row, "work_id", table);
    const children = groups.get(workId) ?? [];
    children.push(row);
    groups.set(workId, children);
  }
  return groups;
}
