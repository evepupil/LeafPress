export interface SourceSummary {
  readonly ref: string;
  readonly title: string;
  readonly locale: string;
  readonly publishedAt?: string;
  readonly updatedAt?: string;
  readonly tags: readonly string[];
  readonly draft: boolean;
  readonly translationKey?: string;
  readonly origin: "notion" | "repo";
  readonly contentHash: string;
  readonly path: string;
}

export interface ParsedSource extends SourceSummary {
  readonly description?: string;
  readonly body: string;
  readonly images: readonly string[];
  readonly mermaidBlockCount: number;
  readonly internalLinks: readonly string[];
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

export interface SourceIssue {
  readonly path: string;
  readonly message: string;
}

export interface SourceListing {
  readonly sources: readonly SourceSummary[];
  readonly issues: readonly SourceIssue[];
}

export type SyncAction =
  | "fast-forwarded"
  | "up-to-date"
  | "skipped-dirty"
  | "skipped-ahead"
  | "skipped-diverged"
  | "failed";

export interface SyncResult {
  readonly action: SyncAction;
  readonly branch: string;
  readonly behindBefore: number;
  readonly aheadBefore: number;
  readonly message: string;
}
