import type { WeeklyNote } from "@leafpress/core";

import {
  readRepo,
  requiredString,
  writeRepo,
  type RepoContext,
  type SqlRow,
} from "./repo-common.js";
import type { NotesRepo } from "./types.js";

export function createNotesRepo(context: RepoContext): NotesRepo {
  return {
    list() {
      return readRepo(
        "weekly_notes",
        "week, wins, improve, next, updated_at",
        () =>
          context.db
            .prepare(
              "SELECT week, wins, improve, next, updated_at FROM weekly_notes ORDER BY week DESC",
            )
            .all()
            .map((raw) => {
              const row = raw as SqlRow;
              return {
                week: requiredString(row, "week", "weekly_notes"),
                wins: requiredString(row, "wins", "weekly_notes"),
                improve: requiredString(row, "improve", "weekly_notes"),
                next: requiredString(row, "next", "weekly_notes"),
                updatedAt: requiredString(row, "updated_at", "weekly_notes"),
              } satisfies WeeklyNote;
            }),
      );
    },
    save(note) {
      writeRepo(
        context,
        "weekly_notes",
        "week, wins, improve, next, updated_at",
        () => {
          context.db
            .prepare(
              `INSERT INTO weekly_notes (week, wins, improve, next, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(week) DO UPDATE SET wins = excluded.wins, improve = excluded.improve, next = excluded.next, updated_at = excluded.updated_at`,
            )
            .run(note.week, note.wins, note.improve, note.next, note.updatedAt);
        },
      );
    },
  };
}
