import type { IdeaProbesRepo } from "./types.js";
import {
  readRepo,
  requiredString,
  writeRepo,
  type RepoContext,
} from "./repo-common.js";

export function createIdeaProbesRepo(context: RepoContext): IdeaProbesRepo {
  return {
    get(key) {
      return readRepo("idea_probes", "key, at", () => {
        const row = context.db
          .prepare("SELECT at FROM idea_probes WHERE key = ?")
          .get(key);
        return row === undefined
          ? undefined
          : requiredString(row, "at", "idea_probes");
      });
    },
    set(key, at) {
      writeRepo(context, "idea_probes", "key, at", () => {
        context.db
          .prepare(
            "INSERT INTO idea_probes (key, at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at",
          )
          .run(key, at);
      });
    },
  };
}
