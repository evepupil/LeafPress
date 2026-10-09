/** `leafpress account import <账号>`：把博客仓库里的已发文章导成已完成作品。 */
import type { ImportSummary, UseCases } from "@leafpress/core";
import type { CliContext } from "../context.js";
import { slimWork, type SlimWork } from "./json-slim.js";
import { emitSuccess, positionalArgs, requiredString } from "./shared.js";

/** JSON 里的导入结果：作品只留 id、标题、链接、发布日期 */
export interface SlimImportSummary {
  added: number;
  skipped: number;
  drafts: number;
  issues: { path: string; message: string }[];
  works: SlimWork[];
}

export function executeAccountImport(
  usecases: Pick<UseCases, "importPosts">,
  id: string,
): Promise<ImportSummary> {
  return usecases.importPosts(id);
}

/** 和工作台「导入」按钮说的话一致：先讲新增和已有，再讲跳过的草稿和读不了的，最后每篇读不了的原稿一行 */
export function renderAccountImport(summary: ImportSummary): string {
  const parts = [
    ...(summary.drafts > 0 ? [`跳过 ${summary.drafts} 篇草稿`] : []),
    ...(summary.issues.length > 0 ? [`${summary.issues.length} 篇读不了`] : []),
  ];
  return [
    `导入 ${summary.added} 篇，${summary.skipped} 篇已经有了`,
    ...(parts.length > 0 ? [parts.join("，")] : []),
    ...summary.issues.map((issue) => `${issue.path}：${issue.message}`),
  ].join("\n");
}

export function slimImportSummary(summary: ImportSummary): SlimImportSummary {
  return {
    added: summary.added,
    skipped: summary.skipped,
    drafts: summary.drafts,
    issues: summary.issues,
    works: summary.works.map(slimWork),
  };
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const id = requiredString(positionalArgs(args)[0], "账号编号");
  const summary = await executeAccountImport(await context.getUseCases(), id);
  emitSuccess(
    context,
    { summary: slimImportSummary(summary) },
    renderAccountImport(summary),
  );
}
