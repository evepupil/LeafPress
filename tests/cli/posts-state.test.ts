import { describe, expect, it } from "vitest";

import { computePublicationState } from "../../src/cli/commands/posts-state.js";
import type { PublicationOverviewRow } from "../../src/store/types.js";

const articleTarget = { platform: "zhihu", format: "article" } as const;

function row(
  patch: Partial<PublicationOverviewRow> = {},
): PublicationOverviewRow {
  return {
    sourceId: "source-1",
    platform: "zhihu",
    format: "article",
    targetKey: "",
    variantId: "variant-1",
    variantStatus: "draft",
    ...patch,
  };
}

describe("原稿发布状态计算", () => {
  it("没有版本或发布记录时为 none", () => {
    expect(computePublicationState([], articleTarget)).toEqual({
      state: "none",
      count: 0,
      urls: [],
    });
  });

  it("已发布记录优先，统计链接数量", () => {
    expect(
      computePublicationState(
        [
          row({
            publicationId: "pub-1",
            publicationStatus: "published",
            url: "https://one.test",
          }),
          row({
            publicationId: "pub-2",
            publicationStatus: "published",
            url: "https://two.test",
          }),
        ],
        articleTarget,
      ),
    ).toEqual({
      state: "published",
      count: 2,
      urls: ["https://one.test", "https://two.test"],
    });
  });

  it("没有已发布记录但有发布意图时为 pending", () => {
    expect(
      computePublicationState(
        [row({ publicationStatus: "pending" })],
        articleTarget,
      ).state,
    ).toBe("pending");
  });

  it("没有发布意图但有待核实记录时为 unverified", () => {
    expect(
      computePublicationState(
        [row({ publicationStatus: "unverified" })],
        articleTarget,
      ).state,
    ).toBe("unverified");
  });

  it("草稿或待确认版本为 in-progress", () => {
    expect(computePublicationState([row()], articleTarget).state).toBe(
      "in-progress",
    );
    expect(
      computePublicationState(
        [row({ variantStatus: "pending-confirm" })],
        articleTarget,
      ).state,
    ).toBe("in-progress");
  });

  it("忽略已放弃版本上的发布记录", () => {
    expect(
      computePublicationState(
        [
          row({
            variantStatus: "abandoned",
            publicationId: "discarded",
            publicationStatus: "published",
            url: "https://ignored.test",
          }),
        ],
        articleTarget,
      ),
    ).toEqual({ state: "none", count: 0, urls: [] });
  });

  it("一篇原稿回答多个问题时显示已发 2 并保留两个链接", () => {
    expect(
      computePublicationState(
        [
          row({
            format: "answer",
            targetKey: "question-1",
            variantId: "answer-1",
            publicationId: "answer-pub-1",
            publicationStatus: "published",
            url: "https://zhihu.test/answer/1",
          }),
          row({
            format: "answer",
            targetKey: "question-2",
            variantId: "answer-2",
            publicationId: "answer-pub-2",
            publicationStatus: "published",
            url: "https://zhihu.test/answer/2",
          }),
        ],
        { platform: "zhihu", format: "answer" },
      ),
    ).toEqual({
      state: "published",
      count: 2,
      urls: ["https://zhihu.test/answer/1", "https://zhihu.test/answer/2"],
    });
  });
});
