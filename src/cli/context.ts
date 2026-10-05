/** CLI 运行上下文：统一解析路径，并按需缓存下层模块实例。 */
import { homedir as osHomedir } from "node:os";

import { loadConfig } from "../config/load.js";
import { homePaths, resolveHome } from "../config/home.js";
import type { LeafPressConfig } from "../config/schema.js";
import { openStore } from "../store/open.js";
import type { Store } from "../store/types.js";
import {
  createDefaultRegistry,
  type PlatformRegistry,
} from "../platforms/registry.js";
import {
  createWorkflowEngine,
  type WorkflowEngine,
} from "../workflows/engine.js";
import { WORKFLOWS } from "../workflows/catalog.js";
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
  getStore(): Store;
  getRegistry(): Promise<PlatformRegistry>;
  getEngine(): WorkflowEngine;
  findEdge(configuredPath?: string): string | undefined;
  readonly exitCode: number;
  setExitCode(code: number): void;
  close(): void;
}

/** 只创建命令本次实际需要的下层对象，避免 doctor 误开写数据库。 */
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
  let store: Store | undefined;
  let registryPromise: Promise<PlatformRegistry> | undefined;
  let engine: WorkflowEngine | undefined;
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
    getStore(): Store {
      store ??= openStore(paths.dbFile);
      return store;
    },
    getRegistry(): Promise<PlatformRegistry> {
      registryPromise ??= this.getConfig().then((config) =>
        createDefaultRegistry({
          blog: {
            repoPath: config.blog.repoPath,
            contentDir: config.blog.contentDir,
            remote: config.blog.remote,
            branch: config.blog.branch,
          },
        }),
      );
      return registryPromise;
    },
    getEngine(): WorkflowEngine {
      engine ??= createWorkflowEngine({
        store: this.getStore().runs,
        workflows: WORKFLOWS,
        runsDir: paths.runsDir,
      });
      return engine;
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
    close(): void {
      store?.close();
    },
  };
}
