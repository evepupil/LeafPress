/** 原稿发布状态汇总：忽略已放弃版本，按平台与形态聚合。 */
import type { PublicationOverviewRow } from "../../store/types.js";
import type { PublishTarget } from "../../platforms/types.js";

export type PublicationState =
  "published" | "pending" | "unverified" | "in-progress" | "none";

export interface PublicationStateResult {
  readonly state: PublicationState;
  readonly count: number;
  readonly urls: readonly string[];
}

export function computePublicationState(
  rows: readonly PublicationOverviewRow[],
  target: Pick<PublishTarget, "platform" | "format">,
): PublicationStateResult {
  const active = rows.filter(
    (row) =>
      row.platform === target.platform &&
      row.format === target.format &&
      row.variantStatus !== "abandoned",
  );
  const published = active.filter(
    (row) => row.publicationStatus === "published",
  );
  if (published.length > 0) {
    const unique = new Map(
      published.map((row, index) => [row.publicationId ?? `row-${index}`, row]),
    );
    const records = [...unique.values()];
    return {
      state: "published",
      count: records.length,
      urls: records.flatMap((row) => (row.url === undefined ? [] : [row.url])),
    };
  }
  if (active.some((row) => row.publicationStatus === "pending")) {
    return { state: "pending", count: 0, urls: [] };
  }
  if (active.some((row) => row.publicationStatus === "unverified")) {
    return { state: "unverified", count: 0, urls: [] };
  }
  if (
    active.some(
      (row) =>
        row.variantStatus === "draft" ||
        row.variantStatus === "pending-confirm",
    )
  ) {
    return { state: "in-progress", count: 0, urls: [] };
  }
  return { state: "none", count: 0, urls: [] };
}
