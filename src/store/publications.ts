import type { Publication, PlatformId } from "../core/content.js";
import { LeafPressError } from "../shared/errors.js";
import type { FormatId } from "../core/formats.js";
import type {
  PublicationRecordInput,
  PublicationRepo,
  PublicationResult,
} from "./types.js";
import {
  encodeJson,
  requiredString,
  storeFailed,
  storeOperation,
  type StoreContext,
} from "./sql.js";
import { mapPublication } from "./publication-mapping.js";

interface VariantTarget {
  readonly sourceId: string;
  readonly platform: PlatformId;
  readonly format: FormatId;
  readonly targetKey: string;
}

export function createPublicationsRepo(context: StoreContext): PublicationRepo {
  const { db, newId, now } = context;

  function getById(id: string): Publication | undefined {
    const row = db.prepare("SELECT * FROM publications WHERE id = ?").get(id);
    return row === undefined ? undefined : mapPublication(row);
  }

  function getTarget(variantId: string): VariantTarget {
    const row = db
      .prepare(
        "SELECT source_id, platform, format, target_key FROM variants WHERE id = ?",
      )
      .get(variantId);
    if (row === undefined) {
      throw storeFailed(`版本「${variantId}」不存在，无法登记发布。`);
    }
    return {
      sourceId: requiredString(row, "source_id", "variants"),
      platform: requiredString(row, "platform", "variants"),
      format: requiredString(row, "format", "variants") as FormatId,
      targetKey: requiredString(row, "target_key", "variants"),
    };
  }

  function findTargetBlock(target: VariantTarget): Publication | undefined {
    const row = db
      .prepare(
        `SELECT p.*
         FROM publications AS p
         JOIN variants AS v ON v.id = p.variant_id
         WHERE v.source_id = ? AND v.platform = ? AND v.format = ?
           AND v.target_key = ? AND p.status IN ('published', 'pending', 'unverified')
         ORDER BY CASE p.status
           WHEN 'published' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
           p.published_at ASC, p.id ASC
         LIMIT 1`,
      )
      .get(target.sourceId, target.platform, target.format, target.targetKey);
    return row === undefined ? undefined : mapPublication(row);
  }

  function ensureTargetAvailable(target: VariantTarget): void {
    const blocking = findTargetBlock(target);
    if (blocking === undefined) return;
    if (blocking.status === "published") {
      throw new LeafPressError(
        "ALREADY_PUBLISHED",
        `平台「${target.platform}」的形态「${target.format}」已有发布记录，链接：${blocking.url ?? "（缺失）"}`,
      );
    }
    throw new LeafPressError(
      "PUBLISH_IN_DOUBT",
      `平台「${target.platform}」的形态「${target.format}」上次发布结果尚未核实。`,
      { hint: "请先核实上次的发布结果，再决定是否重新发布。" },
    );
  }

  function insertPublication(input: {
    readonly variantId: string;
    readonly target: VariantTarget;
    readonly mode: Publication["mode"];
    readonly status: Publication["status"];
    readonly url?: string;
    readonly platformContentId?: string;
    readonly publishedAt?: string;
    readonly raw?: Record<string, unknown>;
  }): Publication {
    const id = newId();
    const publishedAt = input.publishedAt ?? now().toISOString();
    db.prepare(
      `INSERT INTO publications (
        id, variant_id, platform, format, mode, status, url,
        platform_content_id, published_at, raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.variantId,
      input.target.platform,
      input.target.format,
      input.mode,
      input.status,
      input.url ?? null,
      input.platformContentId ?? null,
      publishedAt,
      input.raw === undefined
        ? null
        : encodeJson(input.raw, "publications", "raw"),
    );
    const publication = getById(id);
    if (publication === undefined)
      throw storeFailed("新建发布记录后无法读取记录。");
    return publication;
  }

  function markVariantPublished(variantId: string): void {
    db.prepare(
      "UPDATE variants SET status = 'published', updated_at = ? WHERE id = ?",
    ).run(now().toISOString(), variantId);
  }

  return {
    begin(input) {
      return storeOperation("登记发布意图失败。", () =>
        context.withTransaction(() => {
          const target = getTarget(input.variantId);
          ensureTargetAvailable(target);
          return insertPublication({
            variantId: input.variantId,
            target,
            mode: input.mode,
            status: "pending",
          });
        }),
      );
    },

    complete(id, result: PublicationResult) {
      return storeOperation("完成发布记录失败。", () =>
        context.withTransaction(() => {
          const pending = getById(id);
          if (pending?.status !== "pending") {
            throw storeFailed(`发布记录「${id}」不是待完成状态。`);
          }
          if (result.status === "published" && result.url.length === 0) {
            throw storeFailed("已发布状态必须填写非空链接。");
          }
          if (result.status === "published") {
            db.prepare(
              `UPDATE publications
               SET status = 'published', url = ?, platform_content_id = ?,
                   published_at = ?, raw = ?
               WHERE id = ? AND status = 'pending'`,
            ).run(
              result.url,
              result.platformContentId ?? null,
              result.publishedAt ?? now().toISOString(),
              result.raw === undefined
                ? null
                : encodeJson(result.raw, "publications", "raw"),
              id,
            );
            markVariantPublished(pending.variantId);
          } else {
            db.prepare(
              `UPDATE publications SET status = 'unverified', note = ?, raw = ?
               WHERE id = ? AND status = 'pending'`,
            ).run(
              result.reason,
              result.raw === undefined
                ? null
                : encodeJson(result.raw, "publications", "raw"),
              id,
            );
          }
          const publication = getById(id);
          if (publication === undefined)
            throw storeFailed("发布记录更新后无法读取。");
          return publication;
        }),
      );
    },

    abort(id) {
      storeOperation("撤销发布意图失败。", () =>
        context.withTransaction(() => {
          const publication = getById(id);
          if (publication?.status !== "pending") {
            throw storeFailed(`发布记录「${id}」不是待撤销状态。`);
          }
          const result = db
            .prepare(
              "DELETE FROM publications WHERE id = ? AND status = 'pending'",
            )
            .run(id);
          if (result.changes !== 1)
            throw storeFailed("发布意图已被其他操作修改。");
        }),
      );
    },

    recordManual(input: PublicationRecordInput) {
      return storeOperation("登记手动发布记录失败。", () =>
        context.withTransaction(() => {
          const target = getTarget(input.variantId);
          ensureTargetAvailable(target);
          if (input.url.length === 0)
            throw storeFailed("已发布状态必须填写非空链接。");
          const publication = insertPublication({
            variantId: input.variantId,
            target,
            mode: "manual",
            status: "published",
            url: input.url,
            platformContentId: input.platformContentId,
            publishedAt: input.publishedAt,
            raw: input.raw,
          });
          markVariantPublished(input.variantId);
          return publication;
        }),
      );
    },

    confirm(id, patch) {
      return storeOperation("确认发布记录失败。", () =>
        context.withTransaction(() => {
          const publication = getById(id);
          if (publication?.status !== "unverified") {
            throw storeFailed(`发布记录「${id}」不是待核实状态。`);
          }
          if (patch.url.length === 0)
            throw storeFailed("已发布状态必须填写非空链接。");
          db.prepare(
            `UPDATE publications
             SET status = 'published', url = ?, platform_content_id = ?, published_at = ?
             WHERE id = ? AND status = 'unverified'`,
          ).run(
            patch.url,
            patch.platformContentId ?? null,
            now().toISOString(),
            id,
          );
          markVariantPublished(publication.variantId);
          const confirmed = getById(id);
          if (confirmed === undefined)
            throw storeFailed("确认发布后无法读取发布记录。");
          return confirmed;
        }),
      );
    },

    discard(id) {
      storeOperation("丢弃待核实发布记录失败。", () =>
        context.withTransaction(() => {
          const publication = getById(id);
          if (publication?.status !== "unverified") {
            throw storeFailed(`发布记录「${id}」不是待核实状态。`);
          }
          const result = db
            .prepare(
              "DELETE FROM publications WHERE id = ? AND status = 'unverified'",
            )
            .run(id);
          if (result.changes !== 1)
            throw storeFailed("发布记录已被其他操作修改。");
        }),
      );
    },

    get(id) {
      return storeOperation("读取发布记录失败。", () => getById(id));
    },

    listByVariant(variantId) {
      return storeOperation("列出版本发布记录失败。", () =>
        db
          .prepare(
            "SELECT * FROM publications WHERE variant_id = ? ORDER BY published_at ASC, id ASC",
          )
          .all(variantId)
          .map(mapPublication),
      );
    },

    findBlocking(sourceId, platform, format, targetKey) {
      return storeOperation("查询发布占位记录失败。", () =>
        findTargetBlock({ sourceId, platform, format, targetKey }),
      );
    },
  };
}
