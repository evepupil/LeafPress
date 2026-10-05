import type { Publication } from "../core/content.js";
import type { FormatId } from "../core/formats.js";
import {
  decodeJson,
  optionalString,
  requiredString,
  type SqlRow,
} from "./sql.js";

export function mapPublication(row: SqlRow): Publication {
  const note = optionalString(row, "note", "publications");
  const raw = decodeJson<Record<string, unknown>>(
    row.raw,
    "publications",
    "raw",
  );
  const url = optionalString(row, "url", "publications");
  const platformContentId = optionalString(
    row,
    "platform_content_id",
    "publications",
  );
  return {
    id: requiredString(row, "id", "publications"),
    variantId: requiredString(row, "variant_id", "publications"),
    platform: requiredString(row, "platform", "publications"),
    format: requiredString(row, "format", "publications") as FormatId,
    mode: requiredString(row, "mode", "publications") as Publication["mode"],
    status: requiredString(
      row,
      "status",
      "publications",
    ) as Publication["status"],
    ...(url === undefined ? {} : { url }),
    ...(platformContentId === undefined ? {} : { platformContentId }),
    publishedAt: requiredString(row, "published_at", "publications"),
    ...(note === undefined ? {} : { note }),
    ...(raw === undefined ? {} : { raw }),
  };
}
