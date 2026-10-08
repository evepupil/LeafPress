import type { WorkTotals } from "@leafpress/core";

import {
  decodeJson,
  encodeJson,
  requiredString,
  storeFailed,
  validateFiniteNumber,
  validateFiniteNumbers,
  type SqlRow,
} from "./sql.js";
import { readRepo, writeRepo, type RepoContext } from "./repo-common.js";
import type { SnapshotsRepo } from "./types.js";

export function createSnapshotsRepo(context: RepoContext): SnapshotsRepo {
  return {
    accountDays(from, to) {
      return readRepo(
        "account_days",
        "account_id, day, followers, reads, interactions",
        () => {
          const rows = context.db
            .prepare(
              "SELECT account_id, day, followers, reads, interactions FROM account_days WHERE day BETWEEN ? AND ? ORDER BY account_id, day",
            )
            .all(from, to);
          return rows.map((raw) => {
            const row = raw;
            return {
              accountId: requiredString(row, "account_id", "account_days"),
              day: requiredString(row, "day", "account_days"),
              followers: nullableNumber(row, "followers"),
              reads: nullableNumber(row, "reads"),
              interactions: nullableNumber(row, "interactions"),
            };
          });
        },
      );
    },
    workSnapshots(from, to) {
      return readRepo("work_snapshots", "work_id, day, totals", () => {
        const rows = context.db
          .prepare(
            `SELECT work_id, day, totals FROM work_snapshots WHERE day BETWEEN ? AND ?
          UNION ALL
          SELECT current.work_id, current.day, current.totals FROM work_snapshots AS current
          WHERE current.day = (SELECT MAX(previous.day) FROM work_snapshots AS previous
            WHERE previous.work_id = current.work_id AND previous.day < ?)
          ORDER BY work_id, day`,
          )
          .all(from, to, from);
        return rows.map((raw) => {
          const row = raw;
          return {
            workId: requiredString(row, "work_id", "work_snapshots"),
            day: requiredString(row, "day", "work_snapshots"),
            totals: parseTotals(
              decodeJson<unknown>(row.totals, "work_snapshots", "totals"),
            ),
          };
        });
      });
    },
    putAccountDay(record) {
      writeRepo(
        context,
        "account_days",
        "account_id, day, followers, reads, interactions",
        () => {
          validateAccountDay(record);
          context.db
            .prepare(
              `INSERT INTO account_days (account_id, day, followers, reads, interactions) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(account_id, day) DO UPDATE SET followers = excluded.followers, reads = excluded.reads, interactions = excluded.interactions`,
            )
            .run(
              record.accountId,
              record.day,
              record.followers,
              record.reads,
              record.interactions,
            );
        },
        true,
      );
    },
    putWorkSnapshot(record) {
      writeRepo(
        context,
        "work_snapshots, works",
        "work_id, day, totals, totals_day",
        () => {
          validateFiniteNumbers(record.totals, "work_snapshots", "totals");
          const encoded = encodeJson(record.totals, "work_snapshots", "totals");
          context.db
            .prepare(
              `INSERT INTO work_snapshots (work_id, day, totals) VALUES (?, ?, ?)
          ON CONFLICT(work_id, day) DO UPDATE SET totals = excluded.totals`,
            )
            .run(record.workId, record.day, encoded);
          context.db
            .prepare(
              `UPDATE works SET totals = ?, totals_day = ?
          WHERE id = ? AND (totals IS NULL OR totals_day IS NULL OR totals_day <= ?)`,
            )
            .run(
              encodeJson(record.totals, "works", "totals"),
              record.day,
              record.workId,
              record.day,
            );
        },
        true,
      );
    },
  };
}

function validateAccountDay(record: {
  readonly followers: number | null;
  readonly reads: number | null;
  readonly interactions: number | null;
}): void {
  for (const column of ["followers", "reads", "interactions"] as const) {
    const value = record[column];
    if (value !== null) validateFiniteNumber(value, "account_days", column);
  }
}

function nullableNumber(row: SqlRow, column: string): number | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw storeFailed(
    `记录库表「account_days」列「${column}」不是有效有限数字或空值。`,
  );
}

function parseTotals(value: unknown): WorkTotals {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw storeFailed(
      "记录库表「work_snapshots」JSON 列「totals」不是数值映射。",
    );
  }
  const totals: WorkTotals = {};
  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount !== "number" || !Number.isFinite(amount))
      throw storeFailed(
        "记录库表「work_snapshots」JSON 列「totals」不是数值映射。",
      );
    totals[key] = amount;
  }
  return totals;
}
