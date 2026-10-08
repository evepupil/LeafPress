import type { PullRecord } from "@leafpress/core";

import {
  optionalString,
  readRepo,
  requiredString,
  writeRepo,
  type RepoContext,
  type SqlRow,
} from "./repo-common.js";
import type { PullsRepo } from "./types.js";

export function createPullsRepo(context: RepoContext): PullsRepo {
  return {
    add(record) {
      writeRepo(
        context,
        "pulls",
        "account_id, at, status, reason, fix_hint, note",
        () => {
          context.db
            .prepare(
              "INSERT INTO pulls (account_id, at, status, reason, fix_hint, note) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(
              record.accountId,
              record.at,
              record.status,
              record.reason ?? null,
              record.fixHint ?? null,
              record.note ?? null,
            );
        },
      );
    },
    latest() {
      return readRepo(
        "pulls",
        "id, account_id, at, status, reason, fix_hint, note",
        () => {
          const rows = context.db
            .prepare(
              `SELECT id, account_id, at, status, reason, fix_hint, note FROM pulls
          WHERE id IN (SELECT MAX(id) FROM pulls GROUP BY account_id) ORDER BY account_id`,
            )
            .all();
          return rows.map((raw) => {
            const row = raw as SqlRow;
            return {
              accountId: requiredString(row, "account_id", "pulls"),
              at: requiredString(row, "at", "pulls"),
              status: requiredString(
                row,
                "status",
                "pulls",
              ) as PullRecord["status"],
              ...(optionalString(row, "reason", "pulls") === undefined
                ? {}
                : { reason: optionalString(row, "reason", "pulls") }),
              ...(optionalString(row, "fix_hint", "pulls") === undefined
                ? {}
                : { fixHint: optionalString(row, "fix_hint", "pulls") }),
              ...(optionalString(row, "note", "pulls") === undefined
                ? {}
                : { note: optionalString(row, "note", "pulls") }),
            } satisfies PullRecord;
          });
        },
      );
    },
  };
}
