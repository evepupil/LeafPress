import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLATFORMS,
  type PlatformId,
  type PlatformInfo,
  type UseCases,
} from "@leafpress/core";
import { openApp, closeApp, createUseCases } from "../../src/usecases/index.js";
import type {
  PlatformRuntime,
  CodeStepHandler,
  DataTool,
  PostImporter,
} from "../../src/platforms/types.js";
import type { AppContext } from "../../src/usecases/context.js";

export interface TestClock {
  get(): Date;
  set(value: Date): void;
}

export interface UseCaseEnvironment {
  home: string;
  app: AppContext;
  usecases: UseCases;
  clock: TestClock;
}

export interface TestOptions {
  catalog?: Record<PlatformId, PlatformInfo>;
  codeStep?: CodeStepHandler;
  dataTool?: DataTool;
  importer?: PostImporter;
  warn?: (message: string) => void;
}

export function catalogWith(
  overrides: Partial<Record<PlatformId, Partial<PlatformInfo>>> = {},
): Record<PlatformId, PlatformInfo> {
  return Object.fromEntries(
    Object.entries(PLATFORMS).map(([id, platform]) => [
      id,
      { ...platform, ...overrides[id as PlatformId] },
    ]),
  ) as Record<PlatformId, PlatformInfo>;
}

export async function withUseCases<T>(
  run: (environment: UseCaseEnvironment) => T | Promise<T>,
  options: TestOptions = {},
): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "leafpress-usecases-"));
  let current = new Date("2026-10-08T09:00:00+08:00");
  let serial = 0;
  const runtime: PlatformRuntime = {
    codeStep(workflowId, stepId) {
      if (workflowId === "blog-write" && stepId === "gate" && options.codeStep)
        return options.codeStep;
      if (
        workflowId === "general-write" &&
        stepId === "archive" &&
        options.codeStep
      )
        return options.codeStep;
      return undefined;
    },
    dataTool(platform) {
      return platform === "blog" ? options.dataTool : undefined;
    },
    importer(platform) {
      return platform === "blog" ? options.importer : undefined;
    },
  };
  let app: AppContext | undefined;
  try {
    app = openApp({
      home,
      now: () => new Date(current),
      newToken: () => `token-${++serial}`,
      ...(options.catalog === undefined ? {} : { catalog: options.catalog }),
      platforms:
        options.codeStep || options.dataTool || options.importer
          ? runtime
          : undefined,
      ...(options.warn === undefined ? {} : { warn: options.warn }),
    });
    const usecases = createUseCases(app);
    return await run({
      home,
      app,
      usecases,
      clock: {
        get: () => new Date(current),
        set(value) {
          current = new Date(value);
        },
      },
    });
  } finally {
    if (app) closeApp(app);
    await rm(home, { recursive: true, force: true });
  }
}

export function addAccount(
  usecases: UseCases,
  name = "主账号",
  platform: PlatformId = "blog",
  settings?: Record<string, string>,
) {
  return usecases.addAccount({
    platform,
    name,
    intro: "账号档案",
    ...(settings === undefined ? {} : { settings }),
  });
}

export function createWork(
  usecases: UseCases,
  accountId: string,
  title = "测试作品",
) {
  const [created] = usecases.createWorks({
    source: { kind: "new", title },
    accountIds: [accountId],
    brief: "写一篇测试文章",
  });
  if (!created) throw new Error("createWorks 没有创建作品");
  return created;
}

/**
 * 博客写稿要账号先配的两项：博客仓库位置、站点地址。
 * 仓库位置指向这次测试的临时数据目录里的子文件夹，不碰真实的博客仓库（测试里的代码步骤都是假的，不会真去读它）
 */
export function blogSettings(home: string): Record<string, string> {
  return {
    "repo-path": join(home, "blog-repo"),
    "site-url": "https://blog.example",
  };
}

/**
 * 建一个走「通用写稿」的作品。博客账号默认配博客写稿，步骤和产出文件都不一样；
 * 测的是不挑平台的通用流程（稿子.md、你去发布、归档链接）时，建完就换成通用写稿——博客账号本来就能换
 */
export function createGeneralWork(
  usecases: UseCases,
  accountId: string,
  title = "测试作品",
) {
  const work = createWork(usecases, accountId, title);
  return usecases.updateWork(work.id, { workflowId: "general-write" });
}
