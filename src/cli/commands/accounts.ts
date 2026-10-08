import type {
  Account,
  PlatformId,
  SetupState,
  UseCases,
} from "@leafpress/core";
import type { CliContext } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import { renderTable } from "../output.js";
import {
  commandOptions,
  emitSuccess,
  positionalArgs,
  requiredString,
} from "./shared.js";

const PLATFORMS: readonly PlatformId[] = [
  "blog",
  "zhihu",
  "bilibili",
  "xiaohongshu",
];
const SETUP_LABEL: Record<SetupState, string> = {
  ready: "接好了",
  broken: "有问题",
  unfinished: "没接完",
};

export function parsePlatform(value: unknown): PlatformId {
  const platform = requiredString(value, "平台编号");
  if (!PLATFORMS.includes(platform as PlatformId)) {
    throw new LeafPressError(
      "USAGE",
      `平台不合法：${platform}；可选值：${PLATFORMS.join("、")}`,
    );
  }
  return platform as PlatformId;
}

export function executeAccounts(
  usecases: Pick<UseCases, "listAccounts" | "showAccount">,
) {
  const accounts = usecases.listAccounts();
  const details = new Map(
    accounts.map((account) => [account.id, usecases.showAccount(account.id)]),
  );
  return { accounts, details };
}

export function renderAccounts(
  result: ReturnType<typeof executeAccounts>,
): string {
  if (result.accounts.length === 0) return "没有账号";
  return renderTable(
    ["编号", "平台", "名称", "接入", "档案"],
    result.accounts.map((account) => {
      const detail = result.details.get(account.id);
      const profile = account.profile.trim().length > 0 ? "已写" : "没写";
      const state =
        detail === undefined ? "没接完" : SETUP_LABEL[detail.setup.state];
      return [account.id, account.platform, account.name, state, profile];
    }),
  );
}

export function executeAccountShow(
  usecases: Pick<UseCases, "showAccount">,
  id: string,
) {
  return usecases.showAccount(id);
}

export function renderAccountShow(
  result: ReturnType<typeof executeAccountShow>,
): string {
  const { account, setup } = result;
  return [
    `名称：${account.name}`,
    `平台：${account.platform}`,
    `档案路径：${account.profilePath}`,
    `接入状态：${SETUP_LABEL[setup.state]}`,
    "还缺什么：",
    ...(setup.gaps.length === 0
      ? ["（没有）"]
      : setup.gaps.map((gap) => `- ${gap}`)),
    "",
    account.profile.length > 0 ? account.profile : "（档案还没写）",
  ].join("\n");
}

export function renderAddedAccount(account: Account): string {
  return `已添加 ${account.id}，档案在 ${account.profilePath}`;
}

export function executeAddAccount(
  usecases: Pick<UseCases, "addAccount">,
  input: { platform: PlatformId; name: string; intro: string },
): Account {
  return usecases.addAccount(input);
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const operation = requiredString(args[0], "账号操作");
  const usecases = await context.getUseCases();
  if (operation === "list") {
    const result = executeAccounts(usecases);
    emitSuccess(context, { accounts: result.accounts }, renderAccounts(result));
    return;
  }
  if (operation === "show") {
    const id = requiredString(positionalArgs(args.slice(1))[0], "账号编号");
    const result = executeAccountShow(usecases, id);
    emitSuccess(context, result, renderAccountShow(result));
    return;
  }
  if (operation === "add") {
    const options = commandOptions(args.slice(1));
    const platform = parsePlatform(options["platform"]);
    const name = requiredString(options["name"], "账号名称");
    const intro = typeof options["intro"] === "string" ? options["intro"] : "";
    const account = executeAddAccount(usecases, { platform, name, intro });
    emitSuccess(context, { account }, renderAddedAccount(account));
    return;
  }
  throw new Error(`未知 account 操作：${operation}`);
}
