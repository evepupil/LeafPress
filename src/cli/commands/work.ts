import type { StartResult, UseCases, WorkDetail } from "@leafpress/core";
import type { CliContext } from "../context.js";
import {
  commandOptions,
  emitSuccess,
  positionalArgs,
  requiredString,
} from "./shared.js";

export interface StartedWork {
  readonly message: string;
  readonly lease?: StartResult["lease"];
  readonly detail: WorkDetail | null;
}

export function executeWorkShow(
  usecases: Pick<UseCases, "showWork">,
  id: string,
): { detail: WorkDetail } {
  return { detail: usecases.showWork(id) };
}

export function executeWorkNext(
  usecases: Pick<UseCases, "startNext">,
  accountId?: string,
): StartedWork {
  const result = usecases.startNext(
    accountId === undefined ? {} : { accountId },
  );
  if (result === undefined)
    return { message: "待实现里没有能接的作品", detail: null };
  return {
    message: result.message,
    ...(result.lease === undefined ? {} : { lease: result.lease }),
    detail: result.detail,
  };
}

export function executeWorkStart(
  usecases: Pick<UseCases, "startWork">,
  id: string,
  force = false,
): StartedWork {
  const result = usecases.startWork({ id, ...(force ? { force: true } : {}) });
  return {
    message: result.message,
    ...(result.lease === undefined ? {} : { lease: result.lease }),
    detail: result.detail,
  };
}

export function renderStarted(result: StartedWork): string {
  if (result.detail === null) return "待实现里没有能接的作品";
  return [
    result.message,
    ...(result.lease === undefined
      ? []
      : [
          `令牌：${result.lease.token}（推进这个作品时都要带 --lease ${result.lease.token}）`,
        ]),
    "",
    result.detail.context,
  ].join("\n");
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const operation = requiredString(args[0], "作品操作");
  const values = positionalArgs(args.slice(1));
  const options = commandOptions(args.slice(1));
  const usecases = await context.getUseCases();
  if (operation === "show") {
    const id = requiredString(values[0], "作品编号");
    const result = executeWorkShow(usecases, id);
    emitSuccess(context, result, result.detail.context);
    return;
  }
  if (operation === "next") {
    const account =
      typeof options["account"] === "string" ? options["account"] : undefined;
    const result = executeWorkNext(usecases, account);
    const jsonResult = result.detail === null ? { detail: null } : result;
    emitSuccess(context, jsonResult, renderStarted(result));
    return;
  }
  if (operation === "start") {
    const id = requiredString(values[0], "作品编号");
    const result = executeWorkStart(usecases, id, options["force"] === true);
    emitSuccess(context, result, renderStarted(result));
    return;
  }
  throw new Error(`未知 work 操作：${operation}`);
}
