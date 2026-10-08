import {
  weekStartOf,
  type SaveNoteInput,
  type UseCases,
  type WeeklyNote,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import type { AppContext } from "./context.js";
import { nowParts } from "./support.js";

export function createNotesUseCases(
  app: AppContext,
): Pick<UseCases, "saveNote"> {
  return {
    saveNote(week: string, input: SaveNoteInput): WeeklyNote {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week))
        throw new LeafPressError(
          "USAGE",
          "周报日期必须是有效的 YYYY-MM-DD 日期",
        );
      const parsed = new Date(`${week}T00:00:00.000Z`);
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== week
      ) {
        throw new LeafPressError(
          "USAGE",
          "周报日期必须是有效的 YYYY-MM-DD 日期",
        );
      }
      const { at } = nowParts(app);
      if (weekStartOf(week) !== week)
        throw new LeafPressError("USAGE", "周报日期必须是周一");
      return app.store.transaction(() => {
        const note: WeeklyNote = { week, ...input, updatedAt: at };
        app.store.notes.save(note);
        return note;
      });
    },
  };
}
