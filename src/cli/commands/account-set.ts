/**
 * `leafpress account set <账号> <配置项> [值]`：配平台要的东西。
 * 值可能是不给人看的密钥，所以两条规矩：
 * - `--stdin` 从标准输入读值，值不进命令行历史；
 * - 任何输出（成功文字、JSON、错误提示）都不带值，报错宁可少说，不可把值漏出去。
 */
import {
  PLATFORMS,
  type Account,
  type PlatformId,
  type UseCases,
} from "@leafpress/core";
import type { CliContext } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import { commandOptions, emitSuccess, positionalArgs } from "./shared.js";

export interface AccountSetInput {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly clear: boolean;
  /** 用 --stdin 时，标准输入读完前不知道值，输出里也不写它 */
  readonly stdin: boolean;
}

/** 读标准输入，可注入替换，方便测试 */
export type ReadStdin = () => Promise<string>;

const defaultReadStdin: ReadStdin = async () => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(chunk);
    else throw new LeafPressError("USAGE", "--stdin 只能读取文本数据。");
  }
  return Buffer.concat(chunks).toString("utf8");
};

function missing(name: string): never {
  throw new LeafPressError("USAGE", `缺少${name}。`, {
    hint: "运行 leafpress --help 查看用法。",
  });
}

/** 命令行参数变成待保存/待清掉的输入；标志互相矛盾时在碰值之前先报用法错误 */
export function parseAccountSetInput(
  args: readonly unknown[],
  options: { stdin: boolean; clear: boolean },
): AccountSetInput {
  const positions = positionalArgs(args);
  const id =
    typeof positions[0] === "string" ? positions[0] : missing("账号编号");
  const key =
    typeof positions[1] === "string" ? positions[1] : missing("配置项");
  const valueParts = positions
    .slice(2)
    .flatMap((part) =>
      typeof part === "string"
        ? [part]
        : Array.isArray(part)
          ? part.filter((item): item is string => typeof item === "string")
          : [],
    );
  const value = valueParts.join(" ");
  const hasValue = value.trim().length > 0;
  if (options.stdin && options.clear)
    throw new LeafPressError("USAGE", "--stdin 和 --clear 不能一起用。");
  if (options.stdin && hasValue)
    throw new LeafPressError(
      "USAGE",
      "--stdin 从标准输入读值，不要再在命令行里写值。",
    );
  if (options.clear && hasValue)
    throw new LeafPressError("USAGE", "--clear 是清掉配置项，不要再写值。");
  return { id, key, value, clear: options.clear, stdin: options.stdin };
}

/** 配置项不对时，把平台能配的东西列成一句话放进提示 */
export function availableSettingsText(platform: PlatformId): string {
  const definition = PLATFORMS[platform];
  if (definition.setupItems.length === 0)
    return `${definition.name}没有要配的配置项`;
  return `${definition.name}的配置项：${definition.setupItems
    .map((item) => `${item.key}（${item.label}）`)
    .join("、")}`;
}

/** 成功输出只说配了哪一项，不说值 */
export function renderAccountSet(
  input: AccountSetInput,
  account: Account,
): string {
  const item = PLATFORMS[account.platform].setupItems.find(
    (candidate) => candidate.key === input.key,
  );
  const label = item === undefined ? input.key : item.label;
  return input.clear || (!input.stdin && input.value.trim().length === 0)
    ? `已清掉：${label}`
    : `已保存：${label}`;
}

/** 保存/清掉；用例说配置项不对时，把平台可用的配置项补进提示再抛 */
export async function executeAccountSet(
  usecases: Pick<UseCases, "showAccount" | "setSetting">,
  input: AccountSetInput,
  readStdin: ReadStdin = defaultReadStdin,
): Promise<Account> {
  const detail = usecases.showAccount(input.id);
  const value = input.stdin ? await readStdin() : input.value;
  try {
    return usecases.setSetting(input.id, input.key, value);
  } catch (error) {
    if (
      error instanceof LeafPressError &&
      error.code === "USAGE" &&
      error.message.includes("没有这个配置项")
    ) {
      throw new LeafPressError("USAGE", error.message, {
        hint: availableSettingsText(detail.account.platform),
      });
    }
    throw error;
  }
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const options = commandOptions(args);
  const input = parseAccountSetInput(args, {
    stdin: options["stdin"] === true,
    clear: options["clear"] === true,
  });
  const account = await executeAccountSet(await context.getUseCases(), input);
  emitSuccess(context, { account }, renderAccountSet(input, account));
}
