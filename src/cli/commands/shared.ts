import type { UseCases } from "@leafpress/core";
import type { CliContext } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import { renderSuccessJson } from "../output.js";

export type CommandOptions = Record<
  string,
  string | boolean | string[] | undefined
>;

export function commandOptions(args: readonly unknown[]): CommandOptions {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const value = args[index];
    if (typeof value !== "object" || value === null || Array.isArray(value))
      continue;
    if ("opts" in value && typeof value.opts === "function") continue;
    return value as CommandOptions;
  }
  return {};
}

export function positionalArgs(args: readonly unknown[]): unknown[] {
  return args.filter(
    (value) => typeof value === "string" || Array.isArray(value),
  );
}

export function positionalText(args: readonly unknown[]): string {
  return positionalArgs(args)
    .flatMap((value) =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value.filter((part): part is string => typeof part === "string")
          : [],
    )
    .join(" ");
}

export function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LeafPressError("USAGE", `缺少${name}。`, {
      hint: "运行 leafpress --help 查看用法。",
    });
  }
  return value;
}

export function csvValues(
  value: string | undefined,
  label: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  const values = value.split(",").map((item) => item.trim());
  if (values.some((item) => item.length === 0)) {
    throw new LeafPressError("USAGE", `${label}列表里有空项。`);
  }
  return values;
}

export function enumValues<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
): T[] | undefined {
  const values = csvValues(value, label);
  if (values === undefined) return undefined;
  const invalid = values.filter((item) => !allowed.includes(item as T));
  if (invalid.length > 0) {
    throw new LeafPressError(
      "USAGE",
      `${label}不认识：${invalid.join("、")}；可选值：${allowed.join("、")}`,
    );
  }
  return values as T[];
}

export function useCases(context: CliContext): Promise<UseCases> {
  return context.getUseCases();
}

export function emitSuccess(
  context: CliContext,
  result: object,
  humanText: string,
): void {
  process.stdout.write(
    `${context.globalOptions.json ? renderSuccessJson(result) : humanText}\n`,
  );
}

export function renderLineList(
  lines: readonly string[],
  emptyText: string,
): string {
  return lines.length === 0 ? emptyText : lines.join("\n");
}
