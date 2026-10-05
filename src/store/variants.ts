import type { Variant } from "../core/content.js";
import type { VariantRepo } from "./types.js";
import {
  decodeJson,
  encodeJson,
  optionalString,
  requiredString,
  storeFailed,
  storeOperation,
  type SqlRow,
  type StoreContext,
} from "./sql.js";

export function createVariantsRepo(context: StoreContext): VariantRepo {
  const { db, newId, now } = context;

  function get(id: string): Variant | undefined {
    const row = db.prepare("SELECT * FROM variants WHERE id = ?").get(id);
    return row === undefined ? undefined : mapVariant(row);
  }

  return {
    create(input) {
      return storeOperation("创建版本失败。", () => {
        const source = db
          .prepare("SELECT work_id FROM sources WHERE id = ?")
          .get(input.sourceId);
        if (source === undefined) {
          throw storeFailed(`原稿「${input.sourceId}」不存在，无法创建版本。`);
        }
        const workId = requiredString(source, "work_id", "sources");
        const id = newId();
        const timestamp = now().toISOString();
        db.prepare(
          `INSERT INTO variants (
            id, work_id, source_id, platform, format, target_key, status,
            draft_path, options, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          workId,
          input.sourceId,
          input.platform,
          input.format,
          input.targetKey ?? "",
          input.status ?? "draft",
          input.draftPath ?? null,
          encodeJson(input.options ?? {}, "variants", "options"),
          timestamp,
          timestamp,
        );
        const variant = get(id);
        if (variant === undefined)
          throw storeFailed("新建版本后无法读取记录。");
        return variant;
      });
    },

    get(id) {
      return storeOperation("读取版本失败。", () => get(id));
    },

    listBySource(sourceId) {
      return storeOperation("列出原稿版本失败。", () =>
        db
          .prepare(
            "SELECT * FROM variants WHERE source_id = ? ORDER BY created_at ASC, rowid ASC",
          )
          .all(sourceId)
          .map(mapVariant),
      );
    },

    update(id, patch) {
      return storeOperation("更新版本失败。", () => {
        if (get(id) === undefined) {
          throw storeFailed(`版本「${id}」不存在，无法更新。`);
        }
        const assignments: string[] = [];
        const values: (string | null)[] = [];
        if (patch.status !== undefined) {
          assignments.push("status = ?");
          values.push(patch.status);
        }
        if (patch.draftPath !== undefined) {
          assignments.push("draft_path = ?");
          values.push(patch.draftPath);
        }
        if (patch.options !== undefined) {
          assignments.push("options = ?");
          values.push(encodeJson(patch.options, "variants", "options"));
        }
        assignments.push("updated_at = ?");
        values.push(now().toISOString(), id);
        db.prepare(
          `UPDATE variants SET ${assignments.join(", ")} WHERE id = ?`,
        ).run(...values);
        const variant = get(id);
        if (variant === undefined)
          throw storeFailed("更新版本后无法读取记录。");
        return variant;
      });
    },
  };
}

function mapVariant(row: SqlRow): Variant {
  const options = decodeJson<Record<string, unknown>>(
    row.options,
    "variants",
    "options",
  );
  if (options === undefined)
    throw storeFailed("记录库表「variants」的「options」不能为空。");
  const draftPath = optionalString(row, "draft_path", "variants");
  return {
    id: requiredString(row, "id", "variants"),
    workId: requiredString(row, "work_id", "variants"),
    sourceId: requiredString(row, "source_id", "variants"),
    platform: requiredString(row, "platform", "variants"),
    format: requiredString(row, "format", "variants") as Variant["format"],
    targetKey: requiredString(row, "target_key", "variants"),
    status: requiredString(row, "status", "variants") as Variant["status"],
    ...(draftPath === undefined ? {} : { draftPath }),
    options,
    createdAt: requiredString(row, "created_at", "variants"),
    updatedAt: requiredString(row, "updated_at", "variants"),
  };
}
