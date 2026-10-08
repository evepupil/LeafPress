import type { RunResult, StepResult, UseCases, Work } from "@leafpress/core";
import type { CliContext } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import {
  commandOptions,
  csvValues,
  emitSuccess,
  positionalArgs,
  requiredString,
} from "./shared.js";

export function executeStep(
  usecases: Pick<UseCases, "stepWork">,
  id: string,
  lease: string,
  force = false,
): StepResult {
  return usecases.stepWork(id, lease, force ? { force: true } : {});
}

export function executeRun(
  usecases: Pick<UseCases, "runWork">,
  id: string,
  lease: string,
): Promise<RunResult> {
  return usecases.runWork(id, lease);
}

export function parsePositiveStep(value: unknown): number {
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const step = Number(value);
    if (Number.isSafeInteger(step)) return step;
  }
  const shown =
    typeof value === "string" || typeof value === "number" ? `${value}` : "";
  throw new LeafPressError("USAGE", `第几步必须是正整数：${shown}`);
}

export function executeBack(
  usecases: Pick<UseCases, "backWork">,
  id: string,
  step: number,
  lease: string,
): StepResult {
  return usecases.backWork(id, lease, step);
}

export function executeRelease(
  usecases: Pick<UseCases, "releaseWork">,
  id: string,
  lease: string,
): { work: Work } {
  return { work: usecases.releaseWork(id, lease) };
}

export function executeFeedback(
  usecases: Pick<UseCases, "submitFeedback">,
  id: string,
  text: string,
): { work: Work } {
  return { work: usecases.submitFeedback(id, text) };
}

export function executeNew(
  usecases: Pick<UseCases, "createWorks" | "listAccounts" | "showWork">,
  input: { accountIds: string[]; title: string; brief: string },
) {
  const works = usecases.createWorks({
    source: { kind: "new", title: input.title },
    accountIds: input.accountIds,
    brief: input.brief,
  });
  const accounts = new Map(
    usecases.listAccounts().map((account) => [account.id, account]),
  );
  return {
    works,
    rows: works.map((work) => {
      const detail = usecases.showWork(work.id);
      const account = accounts.get(work.accountId);
      return {
        work,
        platform: detail.platform.name,
        accountName: account?.name ?? work.accountId,
        workflowName: detail.workflow.name,
      };
    }),
  };
}

function renewedAt(expiresAt: string): string {
  const month = Number(expiresAt.slice(5, 7));
  const day = Number(expiresAt.slice(8, 10));
  return `${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日 ${expiresAt.slice(11, 16)}`;
}

export function renderStepResult(result: StepResult): string {
  return [
    result.message,
    ...(result.lease === undefined
      ? []
      : [`租约续到 ${renewedAt(result.lease.expiresAt)}`]),
  ].join("\n");
}

export function renderReleased(): string {
  return "已交还，回到待实现最前面";
}

export function renderFeedbackSubmitted(): string {
  return "已提交，回到待实现最前面";
}

export function renderNew(result: ReturnType<typeof executeNew>): string {
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
  const operation = requiredString(args[0], "作品操作");
  const values = positionalArgs(args.slice(1));
  const options = commandOptions(args.slice(1));
  const usecases = await context.getUseCases();
  if (operation === "new") {
    const accountIds = csvValues(
      typeof options["account"] === "string" ? options["account"] : undefined,
      "账号",
    );
    if (accountIds === undefined)
      throw new LeafPressError("USAGE", "必须指定目标账号。");
    const title = requiredString(options["title"], "作品标题");
    const brief = typeof options["brief"] === "string" ? options["brief"] : "";
    const result = executeNew(usecases, { accountIds, title, brief });
    emitSuccess(context, { works: result.works }, renderNew(result));
    return;
  }
  const id = requiredString(values[0], "作品编号");
  const lease =
    typeof options["lease"] === "string" ? options["lease"] : undefined;
  if (
    operation === "step" ||
    operation === "run" ||
    operation === "back" ||
    operation === "release"
  ) {
    if (lease === undefined || lease.length === 0)
      throw new LeafPressError("USAGE", "必须提供 --lease 租约令牌。");
  }
  if (operation === "step") {
    const result = executeStep(
      usecases,
      id,
      lease ?? "",
      options["force"] === true,
    );
    emitSuccess(context, result, renderStepResult(result));
    return;
  }
  if (operation === "run") {
    const result = await executeRun(usecases, id, lease ?? "");
    if (result.outcome.kind === "fail") context.setExitCode(1);
    emitSuccess(context, result, renderStepResult(result));
    return;
  }
  if (operation === "back") {
    const step = parsePositiveStep(values[1]);
    const result = executeBack(usecases, id, step, lease ?? "");
    emitSuccess(context, result, renderStepResult(result));
    return;
  }
  if (operation === "release") {
    const result = executeRelease(usecases, id, lease ?? "");
    emitSuccess(context, result, renderReleased());
    return;
  }
  if (operation === "feedback") {
    const text = values
      .slice(1)
      .flatMap((part) =>
        typeof part === "string"
          ? [part]
          : Array.isArray(part)
            ? part.filter((value): value is string => typeof value === "string")
            : [],
      )
      .join(" ");
    if (text.trim().length === 0)
      throw new LeafPressError("USAGE", "缺少反馈文字。");
    const result = executeFeedback(usecases, id, text);
    emitSuccess(context, result, renderFeedbackSubmitted());
    return;
  }
  throw new Error(`未知 work 操作：${operation}`);
}
