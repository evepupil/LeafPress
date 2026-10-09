import {
  toIsoTime,
  type IsoTime,
  type PullSummary,
  type UseCases,
} from "@leafpress/core";
import type { HomePaths } from "../../config/home.js";
import { LeafPressError } from "../../shared/errors.js";
import type { CliContext } from "../context.js";
import { commandOptions, csvValues, emitSuccess } from "./shared.js";

export interface PullCommandDependencies {
  recordScheduledRun?: (
    paths: HomePaths,
    run: { at: IsoTime; result: "ok" | "failed"; note: string },
  ) => void;
  now?: () => Date;
  /** 拉数据的进度一行（缺省打到标准错误，不混进标准输出里的结果和 --json） */
  writeProgress?: (line: string) => void;
}

type ProgressFn = (accountId: string, message: string) => void;

export function executePullData(
  usecases: Pick<UseCases, "pullData">,
  accountIds?: string[],
  onProgress?: ProgressFn,
): Promise<PullSummary> {
  if (accountIds === undefined && onProgress === undefined) {
    return usecases.pullData(undefined);
  }
  return usecases.pullData({
    ...(accountIds === undefined ? {} : { accountIds }),
    ...(onProgress === undefined ? {} : { onProgress }),
  });
}

function writeToStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function renderPullData(result: PullSummary): string {
  return result.note;
}

function describePullFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
  dependencies: PullCommandDependencies = {},
): Promise<void> {
  const operation = args[0];
  if (operation === "show") {
    const command = await import("./data-show.js");
    await command.run(context, args.slice(1));
    return;
  }
  if (operation !== "pull") {
    throw new LeafPressError("USAGE", "请指定 data pull 或 data show。");
  }
  const options = commandOptions(args.slice(1));
  const scheduled = options["scheduled"] === true;
  let result: PullSummary | undefined;
  let failedAccount = false;
  let failed = false;
  let failure: unknown;
  try {
    const accountIds = csvValues(
      typeof options["account"] === "string" ? options["account"] : undefined,
      "账号",
    );
    const usecases = await context.getUseCases();
    // 第一次补半年历史要拉好几分钟：边拉边报「补历史：第 i/n 天」，人和 agent 都知道没卡住
    const writeProgress = dependencies.writeProgress ?? writeToStderr;
    result = await executePullData(usecases, accountIds, (accountId, message) =>
      writeProgress(`${accountId}：${message}`),
    );
    failedAccount = result.outcomes.some(
      (outcome) => outcome.status === "failed",
    );
    if (scheduled && failedAccount) context.setExitCode(1);
    emitSuccess(context, result, renderPullData(result));
  } catch (error) {
    failed = true;
    failure = error;
    throw error;
  } finally {
    if (scheduled) {
      const recordScheduledRun =
        dependencies.recordScheduledRun ??
        (await import("../../schedule/state.js")).recordScheduledRun;
      const note = failed
        ? `定时拉取失败：${describePullFailure(failure)}`
        : (result?.note ?? "定时拉取没有返回结果");
      recordScheduledRun(context.paths, {
        at: toIsoTime(dependencies.now?.() ?? new Date()),
        result:
          failed || failedAccount || result === undefined ? "failed" : "ok",
        note,
      });
    }
  }
}
