import { exportBackup } from "../files/export.js";
import { profilesStamp } from "../files/profiles.js";
import type { UseCases } from "@leafpress/core";
import type { AppContext } from "./context.js";
import { dataPullScheduleView } from "./schedule-view.js";
import { listAccounts, nowParts, redactAllValues } from "./support.js";

export function createSystemUseCases(
  app: AppContext,
): Pick<UseCases, "bootstrap" | "version" | "exportBackup"> {
  return {
    bootstrap() {
      const { at, today } = nowParts(app);
      return app.store.transaction(() =>
        redactAllValues(app, {
          now: at,
          today,
          version: {
            ...app.store.meta.version(),
            profilesStamp: profilesStamp(app.paths),
          },
          paths: {
            home: app.paths.home,
            tasks: app.paths.tasksDir,
            accounts: app.paths.accountsDir,
            backups: app.paths.backupsDir,
          },
          works: app.store.works.list(),
          ideas: app.store.ideas.list(),
          accounts: listAccounts(app),
          pulls: app.store.pulls.latest(),
          notes: app.store.notes.list(),
          schedules: [dataPullScheduleView(app)],
        }),
      );
    },

    version() {
      return app.store.transaction(() => ({
        ...app.store.meta.version(),
        profilesStamp: profilesStamp(app.paths),
      }));
    },

    exportBackup() {
      const date = app.now();
      return exportBackup(app.paths, app.store, app.config, date);
    },
  };
}
