/** CLI 运行上下文：统一解析路径与配置。 */
import { homedir as osHomedir } from "node:os";

import { loadConfig } from "../config/load.js";
import { homePaths, resolveHome } from "../config/home.js";
import type { LeafPressConfig } from "../config/schema.js";
import { locateEdge, type LocateEdgeOptions } from "../assets/browser.js";

export interface CliGlobalOptions {
  readonly home?: string | undefined;
  readonly json?: boolean | undefined;
}

export interface CliContextDependencies {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly homedir?: string | undefined;
  readonly edgeLocator?:
    ((options?: LocateEdgeOptions) => string | undefined) | undefined;
}

export interface CliContext {
  readonly globalOptions: CliGlobalOptions;
  readonly env: NodeJS.ProcessEnv;
  readonly homedir: string;
  readonly home: string;
  readonly paths: ReturnType<typeof homePaths>;
  getConfig(): Promise<LeafPressConfig>;
  findEdge(configuredPath?: string): string | undefined;
  readonly exitCode: number;
  setExitCode(code: number): void;
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
  const edgeLocator = dependencies.edgeLocator ?? locateEdge;

  let configPromise: Promise<LeafPressConfig> | undefined;
  let exitCode = 0;

  return {
    globalOptions,
    env,
    homedir,
    home,
    paths,
    getConfig(): Promise<LeafPressConfig> {
      configPromise ??= loadConfig(home);
      return configPromise;
    },
    findEdge(configuredPath?: string): string | undefined {
      return edgeLocator({
        configuredPath,
        env,
        platform: process.platform,
      });
    },
    get exitCode(): number {
      return exitCode;
    },
    setExitCode(code: number): void {
      exitCode = code;
    },
  };
}
