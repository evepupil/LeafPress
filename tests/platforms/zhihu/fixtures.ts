/**
 * 知乎代码步骤测试的公共夹具：临时任务文件夹 + 可注请求响应的 CodeStepContext。
 *
 * makeZhihuFixture 建一个能直接交给步骤函数的 ctx（工作、账号、工作流按编号取、
 * 临时任务文件夹、假的 fetch/secret/exec），返回 folder 方便写稿子、读产物；
 * close() 删掉临时文件夹。makeSourceRepo 在系统临时目录放一个假的来源博客仓库。
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { WORKFLOWS, type DayKey } from "@leafpress/core";
import type { Account, Work, WorkflowDef } from "@leafpress/core";

import type { CodeStepContext } from "../../../src/platforms/types.js";

export const ACCESS_SECRET = "fakeAccessSecret0001";

// ---------------------------------------------------------------------------
// 代码步骤（archive、copy-page）

export interface ZhihuFixture {
  ctx: CodeStepContext;
  folder: string;
  /** 假 fetch 记下的请求（任务文件夹素材拿不到才会去站点下载） */
  requests: { url: string; hasSignal: boolean }[];
  setResponses(responses: Record<string, Uint8Array>): void;
  writeFile(name: string, contents: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** 来源博客仓库的信息，toSourceWork 转成 ctx.sourceWork 能用的形状 */
export interface SourceRepo {
  root: string;
  postPath: string;
  remove(): Promise<void>;
}

export function makeWork(
  id: string,
  slug: string,
  options: { publishedAt?: string } = {},
): Work {
  return {
    id,
    title: `内容 ${slug}`,
    accountId: "zhihu-1",
    status: "done",
    brief: "",
    source: { kind: "import" },
    workflowId: "zhihu-article",
    step: 6,
    feedbackHistory: [],
    order: 0,
    createdAt: "2026-10-01T09:00:00+08:00",
    updatedAt: "2026-10-01T09:00:00+08:00",
    url: `https://zhuanlan.zhihu.com/p/${slug}`,
    publishedAt: options.publishedAt ?? "2026-09-01",
    tags: [],
    log: [],
  };
}

function workflowOf(id: string): WorkflowDef {
  const workflow = WORKFLOWS.find((entry) => entry.id === id);
  if (!workflow) throw new Error(`没有编号为 ${id} 的工作流`);
  return workflow;
}

function stepOf(workflow: WorkflowDef) {
  const step = workflow.steps.find((entry) => entry.kind === "code");
  if (!step) throw new Error(`${workflow.id} 没有代码步骤`);
  return step;
}

/** 假的 fetch：按 setResponses 配置回内容，没配置的 404；请求都记下来 */
function fakeFetch(state: ZhihuFixture): typeof fetch {
  const responses = new Map<string, Uint8Array>();
  state.setResponses = (given) => {
    for (const [url, bytes] of Object.entries(given)) responses.set(url, bytes);
  };
  return (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    state.requests.push({
      url,
      hasSignal: init?.signal !== undefined,
    });
    const bytes = responses.get(url);
    if (bytes === undefined)
      return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(new Response(Buffer.from(bytes)));
  };
}

export async function makeZhihuFixture(options: {
  workflowId: string;
  feedback?: string;
  feedbackHistory?: string[];
  sourceWork?: { url?: string; localPath?: string };
  today?: DayKey;
}): Promise<ZhihuFixture> {
  const folder = await mkdtemp(join(tmpdir(), "zhihu-step-"));
  const workflow = workflowOf(options.workflowId);
  const step = stepOf(workflow);
  const work: Work = {
    ...makeWork("w1", "1"),
    workflowId: workflow.id,
    feedback: options.feedback,
    feedbackHistory: (options.feedbackHistory ?? []).map((text, index) => ({
      at: "2026-10-08T21:00:00+08:00",
      step: index,
      stepName: step.name,
      text,
    })),
  };
  const account: Account = {
    id: "zhihu-1",
    platform: "zhihu",
    name: "测试知乎",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: "/data/accounts/zhihu-1.md",
    settings: [],
    createdAt: "2026-01-01T09:00:00+08:00",
    updatedAt: "2026-01-01T09:00:00+08:00",
  };
  const fixture: ZhihuFixture = {
    folder,
    requests: [],
    setResponses: () => undefined,
    async writeFile(name, contents) {
      await writeFile(
        join(folder, name),
        typeof contents === "string" ? contents : Buffer.from(contents),
      );
    },
    async close() {
      await rm(folder, { recursive: true, force: true });
    },
    ctx: {
      work,
      ...(options.sourceWork
        ? { sourceWork: { ...makeWork("s1", "9"), ...options.sourceWork } }
        : {}),
      account,
      workflow,
      step,
      folder,
      today: options.today ?? "2026-10-09",
      now: new Date("2026-10-09T09:00:00+08:00"),
      setting: () => undefined,
      secret: () => ACCESS_SECRET,
      exec: () => Promise.reject(new Error("步骤不该调外部命令")),
      fetch: undefined as never,
      sleep: () => Promise.resolve(),
      heartbeat: () => undefined,
    },
  };
  fixture.ctx.fetch = fakeFetch(fixture);
  return fixture;
}

/** 在系统临时目录放一个假的来源博客仓库（public/、content/posts/…），返回仓库根和一篇原稿的位置 */
export async function makeSourceRepo(
  _fixture: ZhihuFixture,
  files: Record<string, Uint8Array>,
): Promise<SourceRepo> {
  const root = await mkdtemp(join(tmpdir(), "zhihu-source-"));
  const postPath = join(root, "content", "posts", "zh", "old.mdx");
  await mkdir(dirname(postPath), { recursive: true });
  await writeFile(postPath, "正文\n");
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), Buffer.from(bytes));
  }
  return {
    root,
    postPath,
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

export function toSourceWork(source: SourceRepo): Work {
  // 来源是博客作品：用作品夹具造一个完整的 Work，只把链接和原稿位置换成仓库里的
  const work = makeWork("s1", "9");
  return {
    ...work,
    url: "https://blog.example.test/posts/old/",
    localPath: source.postPath,
  };
}
