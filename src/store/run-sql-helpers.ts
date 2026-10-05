import type { RunPatch } from "../workflows/types.js";

export type StoreSqlValue = string | number | null;

export function appendRunPatch(
  assignments: string[],
  values: StoreSqlValue[],
  patch: Omit<RunPatch, "state"> | undefined,
): void {
  if (patch?.cursor !== undefined) {
    assignments.push("cursor = ?");
    values.push(patch.cursor);
  }
  if (patch?.error !== undefined) {
    assignments.push("error = ?");
    values.push(patch.error);
  }
}

export function addRunValue(
  assignments: string[],
  values: StoreSqlValue[],
  column: string,
  value: StoreSqlValue,
): void {
  assignments.push(`${column} = ?`);
  values.push(value);
}

export function isOneChange(changes: number | bigint): boolean {
  return changes === 1 || changes === 1n;
}
