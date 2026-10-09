import {
  reportWeeks,
  weekReport,
  weekStartOf,
  type DayKey,
  type UseCases,
  type WeekReport,
} from "@leafpress/core";
import type { CliContext } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import { slimReport, type SlimWeekReport } from "./json-slim.js";
import { renderReport } from "./report-render.js";
import { commandOptions, emitSuccess } from "./shared.js";

export { renderReport };

export interface ReportResult {
  today: DayKey;
  report: WeekReport;
}

/** --json 的内容：账号和作品只带必要的字段，粉丝拿不到写 null（见 json-slim.ts） */
export interface ReportPayload {
  report: SlimWeekReport;
}

function isDayKey(value: string): value is DayKey {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function availableWeeks(today: DayKey): DayKey[] {
  return reportWeeks(today);
}

/** 缺省是可选周里的第一周，即昨天所在的那一周（可能还没过完）；要看上一整周就要写 --week */
function weekOption(value: string | undefined, today: DayKey): DayKey {
  const weeks = availableWeeks(today);
  const options = weeks.join("、");
  if (value === undefined) {
    const first = weeks[0];
    if (first === undefined) throw new Error("周报没有可选日期。");
    return first;
  }
  if (!isDayKey(value) || weekStartOf(value) !== value)
    throw new LeafPressError(
      "USAGE",
      `--week 必须是有效的周一日期；可选周：${options}`,
    );
  if (!weeks.includes(value))
    throw new LeafPressError(
      "USAGE",
      `--week 不在可选范围内；可选周：${options}`,
    );
  return value;
}

export function executeReport(
  usecases: Pick<UseCases, "bootstrap" | "dataset">,
  week?: string,
): ReportResult {
  const bootstrap = usecases.bootstrap();
  const dataset = usecases.dataset();
  const selectedWeek = weekOption(week, dataset.today);
  return {
    today: dataset.today,
    report: weekReport(
      {
        dataset,
        accounts: bootstrap.accounts,
        works: bootstrap.works,
        notes: bootstrap.notes,
      },
      selectedWeek,
    ),
  };
}

export function reportPayload(result: ReportResult): ReportPayload {
  return { report: slimReport(result.report) };
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const options = commandOptions(args);
  const week =
    typeof options["week"] === "string" ? options["week"] : undefined;
  const usecases = await context.getUseCases();
  const result = executeReport(usecases, week);
  emitSuccess(context, reportPayload(result), renderReport(result));
}
