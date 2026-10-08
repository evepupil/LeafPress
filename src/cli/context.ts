import { existsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeafPressConfig } from "../config/schema.js";
import type { AppContext } from "../usecases/context.js";

import type { UseCases } from "@leafpress/core";

import { homePaths, resolveHome } from "../config/home.js";
import type { HomePaths } from "../config/home.js";
import { LeafPressError } from "../shared/errors.js";
import type { ExecFn } from "../shared/exec.js";

export interface CliGlobalOptions {
  readonly home?: string;
  readonly json?: boolean;
}

export interface CliContextDependencies {
  readonly env?: NodeJS.ProcessEnv;
  readonly homedir?: string;
  readonly useCases?: UseCases;
  readonly exec?: ExecFn;
  readonly platform?: NodeJS.Platform;
  readonly skillSourceDir?: string;
}

export interface CliContext {
  readonly globalOptions: CliGlobalOptions;
  readonly env: NodeJS.ProcessEnv;
  readonly homedir: string;
  readonly home: string;
  readonly paths: HomePaths;
  readonly exec: ExecFn | undefined;
  readonly platform: NodeJS.Platform;
  readonly skillSourceDir: string;
  readonly exitCode: number;
  getConfig(): Promise<LeafPressConfig>;
  getUseCases(): Promise<UseCases>;
  close(): Promise<void>;
  setExitCode(code: number): void;
}

function repositorySkillDirectory(): string {
  return fileURLToPath(new URL("../../skills/leafpress/", import.meta.url));
}

export function createCliContext(
  globalOptions: CliGlobalOptions,
  dependencies: CliContextDependencies = {},
): CliContext {
  const env = dependencies.env ?? process.env;
  const homedir = dependencies.homedir ?? osHomedir();
  const home = resolveHome({
    ...(globalOptions.home === undefined
      ? {}
      : { homeDir: globalOptions.home }),
    env,
    homedir,
  });
  const paths = homePaths(home);
  const skillSourceDir =
    dependencies.skillSourceDir ?? repositorySkillDirectory();
  let exitCode = 0;
  let configPromise: Promise<LeafPressConfig> | undefined;
  let useCases = dependencies.useCases;
  let app: AppContext | undefined;

  return {
    globalOptions,
    env,
    homedir,
    home,
    paths,
    exec: dependencies.exec,
    platform: dependencies.platform ?? process.platform,
    skillSourceDir,
    get exitCode() {
      return exitCode;
    },
    getConfig() {
      configPromise ??= import("../config/load.js").then(({ loadConfig }) =>
        loadConfig(home),
      );
      return configPromise;
    },
    async getUseCases() {
      if (useCases !== undefined) return useCases;
      if (!existsSync(home) || !existsSync(paths.dbFile)) {
        throw new LeafPressError("USAGE", "还没初始化", {
          hint: "先运行 leafpress init",
        });
      }
      const [{ openApp }, { createUseCases }] = await Promise.all([
        import("../usecases/index.js"),
        import("../usecases/create.js"),
      ]);
      app = openApp({
        home,
        warn: (message) => process.stderr.write(`注意：${message}\n`),
      });
      useCases = createUseCases(app);
      return useCases;
    },
    async close() {
      if (app === undefined) return;
      const { closeApp } = await import("../usecases/index.js");
      closeApp(app);
      app = undefined;
    },
    setExitCode(code) {
      exitCode = code;
    },
  };
}

export function resolveCodexHome(context: CliContext): string {
  const configured = context.env["CODEX_HOME"];
  if (configured !== undefined && configured.trim().length > 0)
    return resolve(configured);
  return join(context.homedir, ".codex");
}
