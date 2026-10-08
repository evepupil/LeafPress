import { existsSync, mkdirSync, statSync } from "node:fs";
import type { CliContext } from "../context.js";
import { DEFAULT_CONFIG } from "../../config/schema.js";
import { writeConfigIfAbsent, upgradeLegacyConfig } from "../../config/load.js";
import { LeafPressError } from "../../shared/errors.js";
import type { MigrationReport } from "../../store/types.js";
import { emitSuccess } from "./shared.js";

export interface InitResult {
  readonly home: string;
  readonly configFile: string;
  readonly dbFile: string;
  readonly configUpgraded: boolean;
  readonly configBackup?: string;
  readonly migration: MigrationReport;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface InitDependencies {
  readonly createDirectory?: (directory: string) => void;
  readonly writeConfig?: (
    home: string,
    config: typeof DEFAULT_CONFIG,
  ) => unknown;
}

function systemCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function errorPath(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("path" in error && typeof error.path === "string") return error.path;
  if ("cause" in error) {
    const causePath = errorPath(error.cause);
    if (causePath !== undefined) return causePath;
  }
  if (error instanceof LeafPressError && error.code === "STORE_FAILED") {
    const separator = error.message.lastIndexOf("：");
    if (separator >= 0) return error.message.slice(separator + 1);
  }
  return undefined;
}

function initFilesystemError(
  error: unknown,
  fallbackPath: string,
): LeafPressError {
  if (
    !(error instanceof LeafPressError && error.code === "STORE_FAILED") &&
    systemCode(error) === undefined
  ) {
    throw error;
  }
  const path = errorPath(error) ?? fallbackPath;
  return new LeafPressError("STORE_FAILED", `无法写入路径：${path}`, {
    hint: "检查这个目录的权限",
    cause: error,
  });
}

export async function executeInit(
  context: CliContext,
  dependencies: InitDependencies = {},
): Promise<InitResult> {
  if (existsSync(context.home) && !isDirectory(context.home)) {
    throw new LeafPressError("USAGE", `数据目录路径不是目录：${context.home}`, {
      hint: "请为 --home 指定一个目录路径。",
    });
  }
  const createDirectory =
    dependencies.createDirectory ??
    ((directory: string) => mkdirSync(directory, { recursive: true }));
  for (const directory of [
    context.home,
    context.paths.accountsDir,
    context.paths.tasksDir,
    context.paths.backupsDir,
    context.paths.logsDir,
  ]) {
    try {
      createDirectory(directory);
    } catch (error) {
      throw initFilesystemError(error, directory);
    }
  }

  let configUpgraded: ReturnType<typeof upgradeLegacyConfig>;
  try {
    configUpgraded = upgradeLegacyConfig(context.home);
  } catch (error) {
    throw initFilesystemError(error, context.paths.configFile);
  }
  if (!existsSync(context.paths.configFile)) {
    try {
      (dependencies.writeConfig ?? writeConfigIfAbsent)(
        context.home,
        DEFAULT_CONFIG,
      );
    } catch (error) {
      throw initFilesystemError(error, context.paths.configFile);
    }
  }

  const { openApp, closeApp } = await import("../../usecases/index.js");
  let app: ReturnType<typeof openApp>;
  try {
    app = openApp({ home: context.home });
  } catch (error) {
    throw initFilesystemError(error, context.paths.dbFile);
  }
  const migration = app.store.migration;
  closeApp(app);
  return {
    home: context.paths.home,
    configFile: context.paths.configFile,
    dbFile: context.paths.dbFile,
    configUpgraded: configUpgraded.upgraded,
    ...(configUpgraded.backupPath === undefined
      ? {}
      : { configBackup: configUpgraded.backupPath }),
    migration,
  };
}

export function renderInit(result: InitResult): string {
  return [
    `数据目录：${result.home}`,
    `配置文件：${result.configFile}`,
    `记录库：${result.dbFile}`,
    ...(result.configUpgraded && result.configBackup !== undefined
      ? [`配置已升级，旧的备份在 ${result.configBackup}`]
      : []),
    ...(result.migration.from < result.migration.to &&
    result.migration.backupPath !== undefined
      ? [
          `记录库已从第 ${result.migration.from} 版升到第 ${result.migration.to} 版，备份在 ${result.migration.backupPath}`,
        ]
      : []),
    "下一步：运行 leafpress serve 打开工作台",
  ].join("\n");
}

export async function run(context: CliContext): Promise<void> {
  const result = await executeInit(context);
  emitSuccess(context, result, renderInit(result));
}
