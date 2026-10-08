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

function isNotDirectoryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOTDIR"
  );
}

export async function executeInit(context: CliContext): Promise<InitResult> {
  if (existsSync(context.home) && !isDirectory(context.home)) {
    throw new LeafPressError("USAGE", `数据目录路径不是目录：${context.home}`, {
      hint: "请为 --home 指定一个目录路径。",
    });
  }
  try {
    for (const directory of [
      context.home,
      context.paths.accountsDir,
      context.paths.tasksDir,
      context.paths.backupsDir,
      context.paths.logsDir,
    ]) {
      mkdirSync(directory, { recursive: true });
    }
  } catch (error) {
    if (isNotDirectoryError(error)) {
      throw new LeafPressError(
        "USAGE",
        `数据目录路径中的中间部分不是目录：${context.home}`,
        {
          hint: "请检查 --home 路径中的每一层是否都是目录。",
          cause: error,
        },
      );
    }
    throw error;
  }

  const configUpgraded = upgradeLegacyConfig(context.home);
  if (!existsSync(context.paths.configFile))
    writeConfigIfAbsent(context.home, DEFAULT_CONFIG);

  const { openApp, closeApp } = await import("../../usecases/index.js");
  const app = openApp({ home: context.home });
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
