import {
  defaultBrief,
  type ConvertSourceInput,
  type UseCases,
  type Work,
} from "@leafpress/core";
import type { CliContext } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import {
  commandOptions,
  csvValues,
  emitSuccess,
  positionalArgs,
  requiredString,
} from "./shared.js";

export function executeConvert(
  usecases: Pick<
    UseCases,
    "createWorks" | "listIdeas" | "showWork" | "listAccounts"
  >,
  sourceId: string,
  accountIds: string[],
  brief?: string,
) {
  const source: ConvertSourceInput = sourceId.startsWith("i-")
    ? { kind: "idea", ideaId: sourceId }
    : { kind: "work", workId: sourceId };
  let defaultText: string;
  if (source.kind === "idea") {
    const idea = usecases.listIdeas().find((item) => item.id === source.ideaId);
    if (idea === undefined)
      throw new LeafPressError("NOT_FOUND", `没有这条灵感：${source.ideaId}`);
    defaultText = defaultBrief({ kind: "idea", idea });
  } else {
    const detail = usecases.showWork(source.workId);
    defaultText = defaultBrief({
      kind: "work",
      work: detail.work,
      platform: detail.account.platform,
    });
  }
  const works = usecases.createWorks({
    source,
    accountIds,
    brief: brief ?? defaultText,
  });
  return describeCreated(usecases, works);
}

export function describeCreated(
  usecases: Pick<UseCases, "showWork" | "listAccounts">,
  works: Work[],
) {
  const accounts = new Map(
    usecases.listAccounts().map((account) => [account.id, account.name]),
  );
  return {
    works,
    rows: works.map((work) => {
      const detail = usecases.showWork(work.id);
      return {
        work,
        platform: detail.platform.name,
        accountName: accounts.get(work.accountId) ?? work.accountId,
        workflowName: detail.workflow.name,
      };
    }),
  };
}

export function renderCreated(
  result: ReturnType<typeof describeCreated>,
): string {
  return result.rows
    .map(
      ({ work, platform, accountName, workflowName }) =>
        `已创建 ${work.id}（${platform} · ${accountName}，${workflowName}）`,
    )
    .join("\n");
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const sourceId = requiredString(positionalArgs(args)[0], "灵感或作品编号");
  const options = commandOptions(args);
  const accountIds = csvValues(
    typeof options["to"] === "string" ? options["to"] : undefined,
    "目标账号",
  );
  if (accountIds === undefined)
    throw new LeafPressError("USAGE", "必须指定目标账号。");
  const brief =
    typeof options["brief"] === "string" ? options["brief"] : undefined;
  const usecases = await context.getUseCases();
  const result = executeConvert(usecases, sourceId, accountIds, brief);
  emitSuccess(context, { works: result.works }, renderCreated(result));
}
