import type { Work } from "../core/content.js";
import type { WorkRepo } from "./types.js";
import {
  requiredString,
  storeOperation,
  type SqlRow,
  type StoreContext,
} from "./sql.js";

export function createWorksRepo(context: StoreContext): WorkRepo {
  const { db, newId, now } = context;

  return {
    create(input): Work {
      return storeOperation("创建作品失败。", () => {
        const id = newId();
        const timestamp = now().toISOString();
        db.prepare(
          "INSERT INTO works (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ).run(id, input.title, timestamp, timestamp);
        return {
          id,
          title: input.title,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      });
    },

    get(id): Work | undefined {
      return storeOperation("读取作品失败。", () => {
        const row = db.prepare("SELECT * FROM works WHERE id = ?").get(id);
        return row === undefined ? undefined : mapWork(row);
      });
    },
  };
}

function mapWork(row: SqlRow): Work {
  return {
    id: requiredString(row, "id", "works"),
    title: requiredString(row, "title", "works"),
    createdAt: requiredString(row, "created_at", "works"),
    updatedAt: requiredString(row, "updated_at", "works"),
  };
}
