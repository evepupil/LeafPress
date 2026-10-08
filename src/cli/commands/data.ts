import type { PullSummary, UseCases } from "@leafpress/core";
import type { CliContext } from "../context.js";
import { commandOptions, csvValues, emitSuccess } from "./shared.js";

export function executePullData(
  usecases: Pick<UseCases, "pullData">,
  accountIds?: string[],
): Promise<PullSummary> {
  return usecases.pullData(
    accountIds === undefined ? undefined : { accountIds },
  );
}

export function renderPullData(result: PullSummary): string {
  return result.note;
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const options = commandOptions(args);
  const accountIds = csvValues(
    typeof options["account"] === "string" ? options["account"] : undefined,
    "账号",
  );
  const usecases = await context.getUseCases();
  const result = await executePullData(usecases, accountIds);
  emitSuccess(context, result, renderPullData(result));
}
