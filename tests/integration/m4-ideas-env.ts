import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { UseCases } from "@leafpress/core";

import { closeApp, openApp } from "../../src/usecases/context.js";
import { createUseCases } from "../../src/usecases/create.js";
import type { AppContext } from "../../src/usecases/context.js";

export const NOW = new Date("2026-10-08T09:00:00+08:00");
export const TODAY = "2026-10-08";
export const ACCESS_SECRET = "fakeIdeasAccessSecret2026";
export const ZHIHU_API = "https://developer.zhihu.com/api/v1";
export const BLOG_TITLE = "TypeScript 数据流水线的可观测性实战";

export interface M4IdeasEnvironment {
  home: string;
  devRoot: string;
  project: string;
  app: AppContext;
  usecases: UseCases;
  close(): Promise<void>;
}

function git(project: string, args: string[], date?: string): void {
  execFileSync("git", args, {
    cwd: project,
    stdio: "ignore",
    env: {
      ...process.env,
      ...(date === undefined
        ? {}
        : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
    },
  });
}

async function makeDevProject(project: string): Promise<void> {
  await mkdir(join(project, "src"), { recursive: true });
  git(project, ["init", "--quiet"]);
  git(project, ["config", "user.name", "M4 Integration"]);
  git(project, ["config", "user.email", "m4@example.test"]);

  const commits = [
    [
      "2026-10-02T09:00:00+08:00",
      "建立采集入口",
      "src/collector.ts",
      "export const collect = () => [];\n",
    ],
    [
      "2026-10-05T09:00:00+08:00",
      "实现数据清洗",
      "src/clean.ts",
      "export const clean = (items: unknown[]) => items;\n",
    ],
    [
      "2026-10-07T09:00:00+08:00",
      "补充定时调度",
      "src/schedule.ts",
      "export const schedule = () => true;\n",
    ],
  ] as const;
  for (const [date, message, file, content] of commits) {
    await writeFile(join(project, file), content, "utf8");
    git(project, ["add", file]);
    git(project, ["commit", "--quiet", "-m", message], date);
  }

  const progress = join(project, "docs", "进度", `${TODAY}.md`);
  await mkdir(join(project, "docs", "进度"), { recursive: true });
  await writeFile(
    progress,
    "# 进度\n\n## 完成数据清洗\n已经接通采集与清洗流程。\n\n## 下一步补充测试\n验证边界输入。\n",
    "utf8",
  );
}

export async function openM4IdeasEnvironment(
  fakeFetch: typeof fetch,
): Promise<M4IdeasEnvironment> {
  const home = await mkdtemp(join(tmpdir(), "leafpress-m4-ideas-"));
  const devRoot = join(home, "dev-roots");
  const project = join(devRoot, "leafpress-sample");
  let app: AppContext | undefined;
  try {
    await mkdir(devRoot, { recursive: true });
    await makeDevProject(project);
    let serial = 0;
    app = openApp({
      home,
      now: () => NOW,
      newToken: () => `m4-token-${++serial}`,
      fetch: fakeFetch,
      sleep: async () => {},
      devRoots: [devRoot],
    });
    const usecases = createUseCases(app);
    let closed = false;
    return {
      home,
      devRoot,
      project,
      app,
      usecases,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        if (app) closeApp(app);
        await rm(home, { recursive: true, force: true });
      },
    };
  } catch (error: unknown) {
    if (app) closeApp(app);
    await rm(home, { recursive: true, force: true });
    throw error instanceof Error ? error : new Error(String(error));
  }
}
