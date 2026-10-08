import type { UseCases } from "@leafpress/core";
import type { CliContext } from "../context.js";
import { emitSuccess } from "./shared.js";

export function executeExport(usecases: Pick<UseCases, "exportBackup">): {
  dir: string;
} {
  return usecases.exportBackup();
}

export function renderExport(result: { dir: string }): string {
  return `已导出到 ${result.dir}`;
}

export async function run(context: CliContext): Promise<void> {
  const usecases = await context.getUseCases();
  const result = executeExport(usecases);
  emitSuccess(context, result, renderExport(result));
}
