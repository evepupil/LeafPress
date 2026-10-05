/** posts 命令：同步、列出博客原稿并汇总发布状态。 */
import { relative, resolve, sep } from "node:path";
import type { Command } from "commander";

import type { SourceIssue, SourceSummary } from "../../platforms/types.js";
import type { PublishTarget } from "../../platforms/types.js";
import type { Store } from "../../store/types.js";
import type { PlatformRegistry } from "../../platforms/registry.js";
import { FORMATS } from "../../core/formats.js";
import { LeafPressError } from "../../shared/errors.js";
import type { CliContext } from "../context.js";
import {
  displayWidth,
  renderSuccessJson,
  renderTable,
  truncateByWidth,
} from "../output.js";
import {
  computePublicationState,
  type PublicationState,
} from "./posts-state.js";

export interface PostsOptions {
  readonly sync?: boolean | undefined;
  readonly locale?: string | undefined;
  readonly limit?: string | number | undefined;
}

export interface PostsTargetResult {
  readonly platform: string;
  readonly format: string;
  readonly label: string;
  readonly state: PublicationState;
  readonly count: number;
  readonly urls: readonly string[];
}

export interface PostsSourceResult {
  readonly ref: string;
  readonly title: string;
  readonly publishedAt?: string;
  readonly origin: "notion" | "repo";
  readonly draft: boolean;
  readonly targets: readonly PostsTargetResult[];
}

export interface PostsResult {
  readonly sync?: { readonly action: string; readonly message: string };
  readonly sources: readonly PostsSourceResult[];
  readonly issues: readonly SourceIssue[];
}

export interface PostsDependencies {
  readonly registry?: PlatformRegistry;
  readonly store?: Store;
}

function parseLimit(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) {
    throw new LeafPressError("USAGE", `篇数不是正整数：${text}`, {
      hint: "--limit 后填写大于 0 的整数。",
    });
  }
  const limit = Number(text);
  if (!Number.isSafeInteger(limit)) {
    throw new LeafPressError("USAGE", "篇数超出可用范围。", {
      hint: "请缩小 --limit 指定的篇数。",
    });
  }
  return limit;
}

function issueLocale(
  issue: SourceIssue,
  contentRoot: string,
): string | undefined {
  const pathFromRoot = relative(contentRoot, issue.path);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`)
  ) {
    return undefined;
  }
  return pathFromRoot.split(/[\\/]/)[0];
}

function displayTarget(target: PublishTarget): PostsTargetResult["label"] {
  return `${target.platformName}·${FORMATS[target.format].label}`;
}

/** 执行列表和入库；不负责生成任何人类可读文本。 */
export async function executePosts(
  context: CliContext,
  options: PostsOptions = {},
  dependencies: PostsDependencies = {},
): Promise<PostsResult> {
  const limit = parseLimit(options.limit);
  const config = await context.getConfig();
  const registry = dependencies.registry ?? (await context.getRegistry());
  const provider = registry.get("blog").sources;
  if (provider === undefined) {
    throw new LeafPressError("INTERNAL", "博客平台没有原稿来源。");
  }

  let sync: PostsResult["sync"];
  if (options.sync) {
    try {
      const result = await provider.sync();
      sync = { action: result.action, message: result.message };
    } catch (error) {
      sync = {
        action: "failed",
        message:
          error instanceof LeafPressError
            ? `同步失败：${error.message}`
            : `同步失败：内部错误：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const listing = await provider.list();
  const locale = options.locale ?? config.blog.primaryLocaleDir;
  let sources: readonly SourceSummary[] =
    locale === "all"
      ? listing.sources
      : listing.sources.filter((source) => source.ref.split("/")[0] === locale);
  if (limit !== undefined) sources = sources.slice(0, limit);

  const store = dependencies.store ?? context.getStore();
  const sourceIds = new Map<string, string>();
  store.transaction(() => {
    for (const source of sources) {
      const upserted = store.sources.upsert({
        platform: "blog",
        kind: "article",
        ref: source.ref,
        title: source.title,
        locale: source.locale,
        contentHash: source.contentHash,
        ...(source.publishedAt === undefined
          ? {}
          : { publishedAt: source.publishedAt }),
      });
      sourceIds.set(source.ref, upserted.source.id);
    }
  });

  const targets = registry.publishTargets({ excludePlatforms: ["blog"] });
  const overview = store.publicationOverview([...sourceIds.values()]);
  const results = sources.map((source): PostsSourceResult => {
    const sourceId = sourceIds.get(source.ref);
    const rows = overview.filter((row) => row.sourceId === sourceId);
    return {
      ref: source.ref,
      title: source.title,
      ...(source.publishedAt === undefined
        ? {}
        : { publishedAt: source.publishedAt }),
      origin: source.origin,
      draft: source.draft,
      targets: targets.map((target) => {
        const state = computePublicationState(rows, target);
        return {
          platform: target.platform,
          format: target.format,
          label: displayTarget(target),
          ...state,
        };
      }),
    };
  });

  const contentRoot = resolve(config.blog.repoPath, config.blog.contentDir);
  const issues =
    locale === "all"
      ? listing.issues
      : listing.issues.filter(
          (issue) => issueLocale(issue, contentRoot) === locale,
        );
  return {
    ...(sync === undefined ? {} : { sync }),
    sources: results,
    issues,
  };
}

function displayTitle(source: PostsSourceResult): string {
  const title = source.title.replace(/\s+/gu, " ").trim();
  const suffix = source.draft ? "（草稿）" : "";
  return `${truncateByWidth(title, 40 - displayWidth(suffix))}${suffix}`;
}

function stateLabel(target: PostsTargetResult): string {
  switch (target.state) {
    case "published":
      return target.count > 1 ? `已发 ${target.count}` : "已发";
    case "pending":
      return "发布中";
    case "unverified":
      return "待核实";
    case "in-progress":
      return "进行中";
    case "none":
      return "—";
  }
}

export function renderPosts(
  result: PostsResult,
  targets: readonly PublishTarget[] = [],
): string {
  const targetLabels =
    result.sources[0]?.targets.map((target) => target.label) ??
    targets.map(displayTarget);
  const headers = ["日期", "标题", "来源", ...targetLabels];
  const rows = result.sources.map((source) => [
    source.publishedAt ?? "—",
    displayTitle(source),
    source.origin === "notion" ? "Notion" : "仓库",
    ...source.targets.map(stateLabel),
  ]);
  const publishedCounts = targetLabels.map((label, index) => {
    const count = result.sources.filter(
      (source) => source.targets[index]?.state === "published",
    ).length;
    return `${label} 已发 ${count} 篇`;
  });
  const summary = `共 ${result.sources.length} 篇${publishedCounts.length === 0 ? "" : `；${publishedCounts.join("，")}`}`;
  const issueLines =
    result.issues.length === 0
      ? []
      : [
          `有 ${result.issues.length} 篇元数据有问题`,
          ...result.issues.map((issue) => `- ${issue.path}：${issue.message}`),
        ];
  return [
    ...(result.sync === undefined ? [] : [result.sync.message]),
    renderTable(headers, rows),
    summary,
    ...issueLines,
  ].join("\n");
}

export function register(program: Command, getContext: () => CliContext): void {
  program
    .command("posts")
    .description("列出博客原稿及发布状态")
    .option("--sync", "先尝试快进同步博客仓库")
    .option("--locale <语言目录>", "筛选语言目录，all 表示全部")
    .option("--limit <篇数>", "只显示最新的前几篇")
    .action(async (options: PostsOptions) => {
      const context = getContext();
      const result = await executePosts(context, options);
      if (context.globalOptions.json) {
        process.stdout.write(`${renderSuccessJson(result)}\n`);
      } else {
        const targets = (await context.getRegistry()).publishTargets({
          excludePlatforms: ["blog"],
        });
        process.stdout.write(`${renderPosts(result, targets)}\n`);
      }
    });
}
