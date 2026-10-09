import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { IsoTime } from "@leafpress/core";
import type { HomePaths } from "../config/home.js";
import { writeFileAtomic } from "../files/atomic.js";

export interface ScheduleState {
  version: 1;
  dataPull: {
    installed: boolean;
    /** HH:mm */
    at: string;
    installedAt?: IsoTime;
    lastRunAt?: IsoTime;
    lastResult?: "ok" | "failed";
    lastNote?: string;
  };
}

const DEFAULT_DATA_PULL_AT = "06:00";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isIsoTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function stateFile(paths: HomePaths): string {
  return join(paths.home, "schedule.json");
}

function parseScheduleState(value: unknown): ScheduleState | undefined {
  if (
    !isRecord(value) ||
    value["version"] !== 1 ||
    !isRecord(value["dataPull"])
  ) {
    return undefined;
  }

  const source = value["dataPull"];
  if (typeof source["installed"] !== "boolean" || !isTime(source["at"])) {
    return undefined;
  }
  for (const key of ["installedAt", "lastRunAt"] as const) {
    if (source[key] !== undefined && !isIsoTime(source[key])) return undefined;
  }
  if (
    source["lastNote"] !== undefined &&
    typeof source["lastNote"] !== "string"
  ) {
    return undefined;
  }
  if (
    source["lastResult"] !== undefined &&
    source["lastResult"] !== "ok" &&
    source["lastResult"] !== "failed"
  ) {
    return undefined;
  }

  return {
    version: 1,
    dataPull: {
      installed: source["installed"],
      at: source["at"],
      ...(typeof source["installedAt"] === "string"
        ? { installedAt: source["installedAt"] }
        : {}),
      ...(typeof source["lastRunAt"] === "string"
        ? { lastRunAt: source["lastRunAt"] }
        : {}),
      ...(source["lastResult"] === "ok" || source["lastResult"] === "failed"
        ? { lastResult: source["lastResult"] }
        : {}),
      ...(typeof source["lastNote"] === "string"
        ? { lastNote: source["lastNote"] }
        : {}),
    },
  };
}

function defaultState(defaultAt: string): ScheduleState {
  return { version: 1, dataPull: { installed: false, at: defaultAt } };
}

export function readScheduleState(
  paths: HomePaths,
  defaultAt: string,
): ScheduleState {
  const file = stateFile(paths);
  if (!existsSync(file)) return defaultState(defaultAt);

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return parseScheduleState(parsed) ?? defaultState(defaultAt);
  } catch {
    return defaultState(defaultAt);
  }
}

export function writeScheduleState(
  paths: HomePaths,
  state: ScheduleState,
): void {
  writeFileAtomic(stateFile(paths), `${JSON.stringify(state, null, 2)}\n`);
}

export function recordScheduledRun(
  paths: HomePaths,
  run: { at: IsoTime; result: "ok" | "failed"; note: string },
): void {
  const state = readScheduleState(paths, DEFAULT_DATA_PULL_AT);
  writeScheduleState(paths, {
    version: 1,
    dataPull: {
      ...state.dataPull,
      lastRunAt: run.at,
      lastResult: run.result,
      lastNote: run.note,
    },
  });
}
