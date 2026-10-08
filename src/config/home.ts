import { homedir as osHomedir } from "node:os";
import { join, resolve } from "node:path";

import { LeafPressError } from "../shared/errors.js";

export interface ResolveHomeOptions {
  homeDir?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  homedir?: string | undefined;
}

function isSet(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function resolveHome(options: ResolveHomeOptions = {}): string {
  if (isSet(options.homeDir)) return resolve(options.homeDir);

  const fromEnv = (options.env ?? process.env)["LEAFPRESS_HOME"];
  if (isSet(fromEnv)) return resolve(fromEnv);

  const userHome = options.homedir ?? osHomedir();
  if (isSet(userHome)) return resolve(join(userHome, ".leafpress"));

  throw new LeafPressError(
    "USAGE",
    "无法确定 LeafPress 数据目录：没有传入目录，环境变量 LEAFPRESS_HOME 也没有设置，用户目录不可用。",
    {
      hint: "用 leafpress init 显式指定数据目录，或设置环境变量 LEAFPRESS_HOME。",
    },
  );
}

export interface HomePaths {
  home: string;
  configFile: string;
  credentialsFile: string;
  dbFile: string;
  accountsDir: string;
  tasksDir: string;
  backupsDir: string;
  logsDir: string;
}

export function homePaths(home: string): HomePaths {
  const base = resolve(home);
  return {
    home: base,
    configFile: join(base, "config.json"),
    credentialsFile: join(base, "credentials.json"),
    dbFile: join(base, "leafpress.db"),
    accountsDir: join(base, "accounts"),
    tasksDir: join(base, "tasks"),
    backupsDir: join(base, "backups"),
    logsDir: join(base, "logs"),
  };
}
