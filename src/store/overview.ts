import type { PublicationOverviewRow } from "./types.js";
import {
  optionalString,
  requiredString,
  storeOperation,
  type SqlRow,
  type StoreContext,
} from "./sql.js";

export function createPublicationOverview(
  context: StoreContext,
): (sourceIds: readonly string[]) => PublicationOverviewRow[] {
  const { db } = context;
  return (sourceIds) =>
    storeOperation("读取发布状态总览失败。", () => {
      if (sourceIds.length === 0) return [];
      const placeholders = sourceIds.map(() => "?").join(", ");
      const rows = db
        .prepare(
          `SELECT
             v.source_id AS source_id,
             v.platform AS platform,
             v.format AS format,
             v.target_key AS target_key,
             v.id AS variant_id,
             v.status AS variant_status,
             p.id AS publication_id,
             p.status AS publication_status,
             p.url AS url,
             p.published_at AS published_at
           FROM variants AS v
           LEFT JOIN publications AS p ON p.variant_id = v.id
           WHERE v.source_id IN (${placeholders})
           ORDER BY v.source_id ASC, v.platform ASC, v.format ASC,
             v.target_key ASC, v.created_at ASC, p.published_at ASC, p.id ASC`,
        )
        .all(...sourceIds);
      return rows.map(mapOverviewRow);
    });
}

function mapOverviewRow(row: SqlRow): PublicationOverviewRow {
  const publicationId = optionalString(row, "publication_id", "publications");
  const publicationStatus = optionalString(
    row,
    "publication_status",
    "publications",
  );
  const url = optionalString(row, "url", "publications");
  const publishedAt = optionalString(row, "published_at", "publications");
  return {
    sourceId: requiredString(row, "source_id", "variants"),
    platform: requiredString(row, "platform", "variants"),
    format: requiredString(
      row,
      "format",
      "variants",
    ) as PublicationOverviewRow["format"],
    targetKey: requiredString(row, "target_key", "variants"),
    variantId: requiredString(row, "variant_id", "variants"),
    variantStatus: requiredString(
      row,
      "variant_status",
      "variants",
    ) as PublicationOverviewRow["variantStatus"],
    ...(publicationId === undefined ? {} : { publicationId }),
    ...(publicationStatus === undefined
      ? {}
      : {
          publicationStatus:
            publicationStatus as PublicationOverviewRow["publicationStatus"],
        }),
    ...(url === undefined ? {} : { url }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  };
}
