import type { PlatformId, Source } from "../core/content.js";
import type { SourceRepo, SourceUpsertInput } from "./types.js";
import {
  optionalString,
  requiredString,
  storeFailed,
  storeOperation,
  type SqlRow,
  type StoreContext,
} from "./sql.js";

export function createSourcesRepo(context: StoreContext): SourceRepo {
  const { db, newId, now } = context;

  function getByRef(platform: PlatformId, ref: string): Source | undefined {
    const row = db
      .prepare("SELECT * FROM sources WHERE platform = ? AND ref = ?")
      .get(platform, ref);
    return row === undefined ? undefined : mapSource(row);
  }

  return {
    upsert(input: SourceUpsertInput) {
      return storeOperation("写入原稿记录失败。", () =>
        context.withTransaction(() => {
          const existing = getByRef(input.platform, input.ref);
          if (existing === undefined) {
            const timestamp = now().toISOString();
            const workId = newId();
            const sourceId = newId();
            db.prepare(
              "INSERT INTO works (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ).run(workId, input.title, timestamp, timestamp);
            db.prepare(
              `INSERT INTO sources (
                id, work_id, kind, platform, ref, title, locale, content_hash,
                published_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              sourceId,
              workId,
              input.kind,
              input.platform,
              input.ref,
              input.title,
              input.locale ?? null,
              input.contentHash,
              input.publishedAt ?? null,
              timestamp,
              timestamp,
            );
            const source = getByRef(input.platform, input.ref);
            if (source === undefined)
              throw storeFailed("新建原稿后无法读取记录。");
            return { source, created: true, changed: false };
          }

          const changed =
            existing.title !== input.title ||
            existing.locale !== input.locale ||
            existing.contentHash !== input.contentHash ||
            existing.publishedAt !== input.publishedAt;
          if (changed) {
            db.prepare(
              `UPDATE sources
               SET title = ?, locale = ?, content_hash = ?, published_at = ?, updated_at = ?
               WHERE id = ?`,
            ).run(
              input.title,
              input.locale ?? null,
              input.contentHash,
              input.publishedAt ?? null,
              now().toISOString(),
              existing.id,
            );
          }
          const source = db
            .prepare("SELECT * FROM sources WHERE id = ?")
            .get(existing.id);
          if (source === undefined)
            throw storeFailed("更新原稿后无法读取记录。");
          return { source: mapSource(source), created: false, changed };
        }),
      );
    },

    get(id): Source | undefined {
      return storeOperation("读取原稿失败。", () => {
        const row = db.prepare("SELECT * FROM sources WHERE id = ?").get(id);
        return row === undefined ? undefined : mapSource(row);
      });
    },

    getByRef(platform, ref): Source | undefined {
      return storeOperation("按来源地址读取原稿失败。", () =>
        getByRef(platform, ref),
      );
    },

    list(platform) {
      return storeOperation("列出原稿失败。", () => {
        const rows =
          platform === undefined
            ? db.prepare("SELECT * FROM sources ORDER BY ref ASC").all()
            : db
                .prepare(
                  "SELECT * FROM sources WHERE platform = ? ORDER BY ref ASC",
                )
                .all(platform);
        return rows.map(mapSource);
      });
    },
  };
}

function mapSource(row: SqlRow): Source {
  const locale = optionalString(row, "locale", "sources");
  const publishedAt = optionalString(row, "published_at", "sources");
  return {
    id: requiredString(row, "id", "sources"),
    workId: requiredString(row, "work_id", "sources"),
    kind: requiredString(row, "kind", "sources") as Source["kind"],
    platform: requiredString(row, "platform", "sources"),
    ref: requiredString(row, "ref", "sources"),
    title: requiredString(row, "title", "sources"),
    ...(locale === undefined ? {} : { locale }),
    contentHash: requiredString(row, "content_hash", "sources"),
    ...(publishedAt === undefined ? {} : { publishedAt }),
    createdAt: requiredString(row, "created_at", "sources"),
    updatedAt: requiredString(row, "updated_at", "sources"),
  };
}
