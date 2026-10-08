import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import type { PlatformId, PlatformInfo } from "@leafpress/core";
import { PLATFORMS } from "@leafpress/core";
import {
  openCredentials,
  type CredentialStore,
} from "../config/credentials.js";
import { homePaths, type HomePaths } from "../config/home.js";
import { loadConfig } from "../config/load.js";
import type { LeafPressConfig } from "../config/schema.js";
import { createPlatformRuntime } from "../platforms/registry.js";
import type { PlatformRuntime } from "../platforms/types.js";
import { execCommand, type ExecFn } from "../shared/exec.js";
import { openStore } from "../store/open.js";
import type { Store } from "../store/types.js";

export interface AppContext {
  store: Store;
  paths: HomePaths;
  config: LeafPressConfig;
  credentials: CredentialStore;
  platforms: PlatformRuntime;
  /** 平台目录：缺省是共享包的 PLATFORMS；测试可以换成带配置项的平台。用例里要平台信息一律从这里取。 */
  catalog: Record<PlatformId, PlatformInfo>;
  exec: ExecFn;
  fetch: typeof fetch;
  /** 现在（测试注入）。 */
  now(): Date;
  /** 新的租约令牌（测试注入）；缺省 8 位小写字母和数字。 */
  newToken(): string;
  /** 不影响结果的问题输出。 */
  warn(message: string): void;
}

export interface OpenAppOptions {
  home: string;
  now?: () => Date;
  newToken?: () => string;
  exec?: ExecFn;
  fetch?: typeof fetch;
  platforms?: PlatformRuntime;
  catalog?: Record<PlatformId, PlatformInfo>;
  warn?: (message: string) => void;
}

export function openApp(options: OpenAppOptions): AppContext {
  const paths = homePaths(options.home);
  for (const directory of [
    paths.home,
    paths.accountsDir,
    paths.tasksDir,
    paths.backupsDir,
    paths.logsDir,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  const config = loadConfig(paths.home);
  const store = openStore(paths.dbFile);
  return {
    store,
    paths,
    config,
    credentials: openCredentials(paths.credentialsFile),
    platforms: options.platforms ?? createPlatformRuntime(),
    catalog: options.catalog ?? PLATFORMS,
    exec: options.exec ?? execCommand,
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    now: options.now ?? (() => new Date()),
    newToken:
      options.newToken ??
      (() =>
        Array.from(
          { length: 8 },
          () => "0123456789abcdefghijklmnopqrstuvwxyz"[randomInt(36)] ?? "0",
        ).join("")),
    warn: options.warn ?? ((message) => process.stderr.write(`${message}\n`)),
  };
}

export function closeApp(app: AppContext): void {
  app.store.close();
}
