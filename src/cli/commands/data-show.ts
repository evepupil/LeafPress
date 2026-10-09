import {
  accountSummary,
  hasMetricsData,
  metricSeries,
  topWorks,
  type AccountSummary,
  type DayKey,
  type MetricResult,
  type MetricsInput,
  type RangeId,
  type RankBy,
  type RankedWork,
  type UseCases,
} from "@leafpress/core";
import type { CliContext } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import { renderDataShow } from "./data-show-render.js";
import {
  slimRanked,
  slimSeries,
  slimSummary,
  type SlimRankedWork,
  type SlimSeries,
  type SlimSummary,
} from "./json-slim.js";
import { commandOptions, emitSuccess } from "./shared.js";

export { renderDataShow };

export interface DataShowOptions {
  account?: string;
  range?: string;
  top?: string | number;
  by?: string;
}

interface DataShowBase {
  today: DayKey;
  latestDay: DayKey;
  /** 命令行用 --account 指定了账号：没数据时的那句话不一样 */
  scoped: boolean;
  summaries: AccountSummary[];
}

/** 选中的账号都没有数：走势是补零的序列、排行是空表，算出来也没有意义，所以不算 */
export interface DataShowEmpty extends DataShowBase {
  hasData: false;
}

export interface DataShowFull extends DataShowBase {
  hasData: true;
  range: RangeId;
  series: {
    followers: MetricResult;
    reads: MetricResult;
    interactions: MetricResult;
    posts: MetricResult;
  };
  top: RankedWork[];
}

export type DataShowResult = DataShowEmpty | DataShowFull;

/** --json 的内容：账号和作品只带必要的字段，粉丝拿不到写 null（见 json-slim.ts） */
export interface DataShowPayload {
  today: DayKey;
  latestDay: DayKey;
  /** 选中的账号有没有数；false 时没有 series 和 top */
  hasData: boolean;
  summaries: SlimSummary[];
  series?: SlimSeries;
  top?: SlimRankedWork[];
}

function parseOptions(options: DataShowOptions): {
  accountId?: string;
  range: RangeId;
  top: number;
  by: RankBy;
} {
  const range = options.range ?? "12w";
  if (range !== "4w" && range !== "12w")
    throw new LeafPressError(
      "USAGE",
      `--range 不合法：${range}；可选值：4w、12w`,
    );

  const by = options.by ?? "reach";
  if (by !== "reach" && by !== "interactions" && by !== "growth")
    throw new LeafPressError(
      "USAGE",
      `--by 不合法：${by}；可选值：reach、interactions、growth`,
    );

  const rawTop = options.top ?? 10;
  const topText = String(rawTop);
  if (
    !/^\d+$/u.test(topText) ||
    !Number.isSafeInteger(Number(topText)) ||
    Number(topText) < 1
  )
    throw new LeafPressError("USAGE", `--top 必须是正整数：${topText}`);

  const accountId = options.account?.trim();
  if (options.account !== undefined && !accountId)
    throw new LeafPressError("USAGE", "--account 不能为空");

  return {
    ...(accountId === undefined ? {} : { accountId }),
    range,
    top: Number(topText),
    by,
  };
}

export function executeDataShow(
  usecases: Pick<UseCases, "bootstrap" | "dataset">,
  input: DataShowOptions = {},
): DataShowResult {
  const options = parseOptions(input);
  const bootstrap = usecases.bootstrap();
  const dataset = usecases.dataset();
  const accounts = bootstrap.accounts;
  const works = bootstrap.works;
  const selected =
    options.accountId === undefined
      ? accounts
      : accounts.filter((account) => account.id === options.accountId);
  if (options.accountId !== undefined && selected.length === 0) {
    const available =
      accounts.map((account) => account.id).join("、") || "（没有账号）";
    throw new LeafPressError(
      "USAGE",
      `账号不存在：${options.accountId}；可选值：${available}`,
    );
  }

  const metricsInput: MetricsInput = { dataset, accounts, works };
  const base = {
    today: dataset.today,
    latestDay: dataset.latestDay,
    scoped: options.accountId !== undefined,
    summaries: selected.map((account) => accountSummary(metricsInput, account)),
  };
  // 有没有数看选中的账号，口径和网页数据页是同一个函数
  const ids = selected.map((account) => account.id);
  if (!hasMetricsData(metricsInput, ids)) return { ...base, hasData: false };

  const scope = options.accountId ?? "all";
  return {
    ...base,
    hasData: true,
    range: options.range,
    series: {
      followers: metricSeries(metricsInput, scope, "followers", options.range),
      reads: metricSeries(metricsInput, scope, "reads", options.range),
      interactions: metricSeries(
        metricsInput,
        scope,
        "interactions",
        options.range,
      ),
      posts: metricSeries(metricsInput, scope, "posts", options.range),
    },
    top: topWorks(metricsInput, options.by, options.top, options.accountId),
  };
}

export function dataShowPayload(result: DataShowResult): DataShowPayload {
  const head = {
    today: result.today,
    latestDay: result.latestDay,
    hasData: result.hasData,
    summaries: result.summaries.map(slimSummary),
  };
  if (!result.hasData) return head;
  return {
    ...head,
    series: slimSeries(result.series),
    top: result.top.map(slimRanked),
  };
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const options = commandOptions(args);
  const parsedOptions: DataShowOptions = {
    ...(typeof options["account"] === "string"
      ? { account: options["account"] }
      : {}),
    ...(typeof options["range"] === "string"
      ? { range: options["range"] }
      : {}),
    ...(typeof options["top"] === "string" ? { top: options["top"] } : {}),
    ...(typeof options["by"] === "string" ? { by: options["by"] } : {}),
  };
  // 参数写错先报用法错误，不必先打开记录库（没初始化时也能直接看到哪个参数错了）
  parseOptions(parsedOptions);
  const usecases = await context.getUseCases();
  const result = executeDataShow(usecases, parsedOptions);
  emitSuccess(context, dataShowPayload(result), renderDataShow(result));
}
