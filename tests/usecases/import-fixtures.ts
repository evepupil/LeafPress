import type {
  ImportCandidate,
  ImportContext,
  ImportListing,
  ImportOutcome,
  PostImporter,
} from "../../src/platforms/types.js";

/** 一篇已发布的博客文章；各字段由 slug 推出来，需要时再覆盖 */
export function candidate(
  slug: string,
  overrides: Partial<ImportCandidate> = {},
): ImportCandidate {
  return {
    sourceRef: `zh/${slug}`,
    title: `文章 ${slug}`,
    url: `https://blog.example/posts/${slug}/`,
    publishedAt: "2026-10-01",
    localPath: `/repo/content/posts/zh/${slug}.mdx`,
    tags: ["工程"],
    ...overrides,
  };
}

/** 导入工具读成功的结果；草稿数、问题缺省为没有 */
export function listed(
  candidates: ImportCandidate[],
  rest: Partial<Omit<ImportListing, "candidates">> = {},
): ImportOutcome {
  return { ok: true, listing: { candidates, drafts: 0, issues: [], ...rest } };
}

export interface FakeImporter extends PostImporter {
  /** 每次导入时收到的上下文，按调用先后 */
  readonly calls: ImportContext[];
}

/**
 * 假的导入工具：每次导入时调 next 拿结果（可以抛错、可以换结果），并记下收到的上下文。
 * 经 Promise 调 next，next 同步抛出的异常也会变成导入工具的失败，和真实现一样
 */
export function fakeImporter(
  next: () => ImportOutcome | Promise<ImportOutcome>,
): FakeImporter {
  const calls: ImportContext[] = [];
  return {
    calls,
    list(ctx) {
      calls.push(ctx);
      return Promise.resolve().then(next);
    },
  };
}
