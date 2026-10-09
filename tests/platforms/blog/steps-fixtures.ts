/**
 * 博客步骤测试的公共夹具：
 * - 临时目录里搭一个「作者的博客仓库」（带没提交的改动、暂存的文件、领先线上的本地提交）和一个本地裸仓库当线上；
 * - 数据目录和任务文件夹按真实布局放：<数据目录>/tasks/<作品编号>；
 * - git 走真的，pnpm 换成假的（可以控制成功、失败、超时）；
 * - 作者工作区的快照：每个步骤前后对比，证明一个字节都没动。
 */
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { workflowById } from "@leafpress/core";
import type { Account, Work, WorkflowDef } from "@leafpress/core";

import {
  hashDraft,
  loadDraft,
} from "../../../src/platforms/blog/steps/draft.js";
import {
  type GateRecord,
  writeGateRecord,
} from "../../../src/platforms/blog/steps/records.js";
import type { CodeStepContext } from "../../../src/platforms/types.js";
import {
  execCommand,
  type ExecFn,
  type ExecOptions,
  type ExecResult,
} from "../../../src/shared/exec.js";

import { FakePnpm, isPnpmProbe, pnpmArguments } from "./fake-pnpm.js";

// 假 pnpm 挪到了 fake-pnpm.ts（这个文件太长），从这里原样再导出，现有的测试照旧从这里导入
export {
  FakePnpm,
  failure,
  formatted,
  isPnpmProbe,
  ok,
  pnpmArguments,
  timeout,
} from "./fake-pnpm.js";
export type { PnpmCall, PnpmHandler } from "./fake-pnpm.js";

export const WORK_ID = "b-1";
export const ACCOUNT_ID = "blog-1";
export const SLUG = "test-article";
export const TRANSLATION_KEY = "test-article";
/** 测试里的「现在」：ISO 时间是 2026-10-08T01:00:00.000Z */
export const NOW = new Date("2026-10-08T09:00:00+08:00");
export const NOW_ISO = "2026-10-08T01:00:00.000Z";

export function blogWorkflow(): WorkflowDef {
  const workflow = workflowById("blog-write");
  if (!workflow) throw new Error("找不到博客写稿工作流");
  return workflow;
}

// ---------------------------------------------------------------------------
// 稿子内容

export interface DraftTextOptions {
  title: string;
  locale: "zh-CN" | "en";
  translationKey?: string;
  published?: string;
  /** 额外的 frontmatter 行，原样放进去 */
  extra?: string[];
  body?: string;
}

/** 一篇合格的稿子；正文行尾故意带空格，假 prettier 会去掉，用来证明排好版的稿子被复制回来 */
export function draftText(options: DraftTextOptions): string {
  const lines = [
    "---",
    `title: "${options.title}"`,
    'description: "测试文章"',
    `published: ${options.published ?? '"2026-10-08"'}`,
    `locale: "${options.locale}"`,
    'tags: ["test"]',
    `translationKey: "${options.translationKey ?? TRANSLATION_KEY}"`,
    "draft: false",
    ...(options.extra ?? []),
    "---",
    "",
    options.body ?? "正文。  ",
    "",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// git 调用记录和拦截

export interface GitCall {
  args: readonly string[];
  options: ExecOptions | undefined;
}

/** 拦截一条 git 调用；real() 去执行真的 git。返回什么就当作 git 的结果 */
export type GitInterceptor = (
  call: GitCall,
  real: () => Promise<ExecResult>,
) => Promise<ExecResult>;

// ---------------------------------------------------------------------------
// 夹具

export interface FixtureOptions {
  slug?: string;
  withImages?: boolean;
  /** 作者工作区弄乱一些（没提交的改动、暂存的文件、没跟踪的文件、领先线上的提交）；缺省 true */
  messyWorkspace?: boolean;
  /** 要不要建作者仓库和线上仓库；只测不碰 git 的步骤（归档）时传 false，省掉建仓库的时间 */
  withRepo?: boolean;
  /** 覆盖账号配置，值为 undefined 表示这项没配 */
  settings?: Record<string, string | undefined>;
}

export interface BlogFixture {
  base: string;
  /** 数据目录 */
  home: string;
  /** 作者的博客工作区 */
  repo: string;
  /** 本地裸仓库，当线上 */
  remote: string;
  /** 任务文件夹 */
  folder: string;
  /** LeafPress 的博客检出目录 */
  checkoutDir: string;
  ctx: CodeStepContext;
  pnpm: FakePnpm;
  gitCalls: GitCall[];
  heartbeats: number;
  setInterceptor(interceptor: GitInterceptor | undefined): void;
  git(args: string[], cwd?: string): Promise<string>;
  /** 线上 main 的提交号 */
  remoteHead(): Promise<string>;
  /** 另一个人往线上 main 推一个提交，返回提交号 */
  pushFromElsewhere(
    files: Record<string, string>,
    message: string,
  ): Promise<string>;
  snapshotAuthor(): Promise<WorkspaceSnapshot>;
  close(): Promise<void>;
}

export async function makeBlogFixture(
  options: FixtureOptions = {},
): Promise<BlogFixture> {
  const base = await mkdtemp(join(tmpdir(), "leafpress-blog-"));
  const home = join(base, "home");
  const repo = join(base, "repo");
  const remote = join(base, "remote.git");
  const folder = join(home, "tasks", WORK_ID);
  const slug = options.slug ?? SLUG;

  async function git(args: string[], cwd = repo): Promise<string> {
    const result = await execCommand("git", args, { cwd, timeoutMs: 60_000 });
    if (result.exitCode !== 0)
      throw new Error(`git ${args.join(" ")} 失败：${result.stderr}`);
    return result.stdout.trim();
  }

  /** 搭作者的博客仓库、本地裸仓库（当线上），并推上第一个提交 */
  async function buildAuthorRepo(): Promise<void> {
    await Promise.all([
      git(["init", "--bare", "--initial-branch=main", remote], base),
      git(["init", "--initial-branch=main"]),
    ]);
    // 作者的提交身份写在作者仓库自己的配置里（检出目录共用这份配置）
    await appendFile(
      join(repo, ".git", "config"),
      "[user]\n\tname = Test Author\n\temail = author@example.invalid\n[core]\n\tautocrlf = false\n",
      "utf8",
    );
    await writeFile(join(repo, "README.md"), "初始\n", "utf8");
    await writeFile(
      join(repo, ".gitignore"),
      "node_modules/\n.next/\nout/\n",
      "utf8",
    );
    await writeFile(
      join(repo, "package.json"),
      '{ "name": "fake-blog", "private": true }\n',
      "utf8",
    );
    await writeFile(
      join(repo, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
      "utf8",
    );
    for (const [language, locale] of [
      ["zh", "zh-CN"],
      ["en", "en"],
    ] as const) {
      await mkdir(join(repo, "content", "posts", language), {
        recursive: true,
      });
      await writeFile(
        join(repo, "content", "posts", language, "existing-post.mdx"),
        draftText({
          title: "已有文章",
          locale,
          translationKey: "existing-post",
        }),
        "utf8",
      );
    }
    await git(["add", "-A"]);
    await git(["commit", "-m", "初始提交"]);
    await git(["remote", "add", "origin", remote]);
    await git(["push", "--set-upstream", "origin", "main"]);

    if (options.messyWorkspace !== false) {
      // 作者正在写东西：没提交的改动、暂存的新文件、没跟踪的文件，还有一个没推送的本地提交
      await writeFile(join(repo, "local-only.txt"), "本地提交\n", "utf8");
      await git(["add", "local-only.txt"]);
      await git(["commit", "-m", "只在本地的提交"]);
      await writeFile(join(repo, "README.md"), "作者改到一半\n", "utf8");
      await writeFile(join(repo, "staged.txt"), "已暂存\n", "utf8");
      await git(["add", "staged.txt"]);
      await mkdir(join(repo, "notes"), { recursive: true });
      await writeFile(join(repo, "notes", "idea.md"), "没跟踪\n", "utf8");
    }
  }

  await mkdir(folder, { recursive: true });
  await mkdir(repo, { recursive: true });
  if (options.withRepo !== false) await buildAuthorRepo();

  await writeFile(join(folder, "slug.txt"), `${slug}\n`, "utf8");
  await writeFile(
    join(folder, "中文稿.mdx"),
    draftText({ title: "测试文章", locale: "zh-CN" }),
    "utf8",
  );
  await writeFile(
    join(folder, "英文稿.mdx"),
    draftText({ title: "Test Article", locale: "en", body: "Body.  " }),
    "utf8",
  );
  if (options.withImages) {
    await mkdir(join(folder, "images"), { recursive: true });
    await writeFile(
      join(folder, "images", "cover.png"),
      Buffer.from([1, 2, 3]),
    );
  }

  const account: Account = {
    id: ACCOUNT_ID,
    platform: "blog",
    name: "测试博客",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: join(folder, "profile.md"),
    settings: [],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
  const workflow = blogWorkflow();
  const gateStep = workflow.steps[3];
  if (!gateStep) throw new Error("博客写稿工作流缺少第 4 步");
  const work: Work = {
    id: WORK_ID,
    title: "测试文章",
    accountId: account.id,
    status: "doing",
    brief: "写测试文章",
    source: { kind: "none" },
    workflowId: workflow.id,
    step: 3,
    feedbackHistory: [],
    order: 0,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    tags: [],
    log: [],
  };
  const settings: Record<string, string | undefined> = {
    "repo-path": repo,
    "site-url": "https://blog.example.test/",
    ...options.settings,
  };

  const pnpm = new FakePnpm();
  const gitCalls: GitCall[] = [];
  let interceptor: GitInterceptor | undefined;
  const exec: ExecFn = async (command, args, execOptions) => {
    if (isPnpmProbe(command, args)) return pnpm.probe();
    const pnpmArgs = pnpmArguments(command, args);
    if (pnpmArgs)
      return pnpm.run(pnpmArgs, execOptions?.cwd ?? "", execOptions);
    const call: GitCall = { args, options: execOptions };
    gitCalls.push(call);
    const real = (): Promise<ExecResult> =>
      execCommand(command, [...args], execOptions);
    return interceptor ? interceptor(call, real) : real();
  };

  const fixture: BlogFixture = {
    base,
    home,
    repo,
    remote,
    folder,
    checkoutDir: join(home, "blog-checkout", ACCOUNT_ID),
    pnpm,
    gitCalls,
    heartbeats: 0,
    setInterceptor(next) {
      interceptor = next;
    },
    git,
    async remoteHead() {
      return git(["--git-dir", remote, "rev-parse", "refs/heads/main"], base);
    },
    async pushFromElsewhere(files, message) {
      const other = await mkdtemp(join(base, "other-"));
      await git(
        [
          "clone",
          "-c",
          "user.name=Someone Else",
          "-c",
          "user.email=else@example.invalid",
          remote,
          other,
        ],
        base,
      );
      for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(other, path)), { recursive: true });
        await writeFile(join(other, path), content, "utf8");
      }
      await git(["add", "-A"], other);
      await git(["commit", "-m", message], other);
      await git(["push", "origin", "main"], other);
      return git(["rev-parse", "HEAD"], other);
    },
    snapshotAuthor: () => snapshotWorkspace(repo),
    async close() {
      await rm(base, { recursive: true, force: true });
    },
    ctx: {
      work,
      account,
      workflow,
      step: gateStep,
      folder,
      today: "2026-10-09",
      now: NOW,
      setting: (key) => settings[key],
      secret: () => undefined,
      exec,
      fetch: () => Promise.reject(new Error("测试里没有注入网络请求")),
      sleep: () => Promise.resolve(),
      heartbeat() {
        fixture.heartbeats += 1;
      },
    },
  };
  return fixture;
}

// ---------------------------------------------------------------------------
// 作者工作区快照

export interface WorkspaceSnapshot {
  /** 除 .git 外所有文件：相对路径 → 内容的 sha256 */
  files: Record<string, string>;
  status: string;
  head: string;
  localBranches: string;
  /** 暂存区文件的字节指纹 */
  index: string;
  stash: string;
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (path === ".git") continue;
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else files.push(path);
  }
  return files.sort();
}

export async function snapshotWorkspace(
  repo: string,
): Promise<WorkspaceSnapshot> {
  const git = async (args: string[]): Promise<string> => {
    const result = await execCommand("git", ["--no-optional-locks", ...args], {
      cwd: repo,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout;
  };
  const files: Record<string, string> = {};
  for (const path of await listFiles(repo)) {
    files[path] = createHash("sha256")
      .update(await readFile(join(repo, path)))
      .digest("hex");
  }
  const indexPath = join(repo, ".git", "index");
  const hasIndex = await stat(indexPath).then(
    () => true,
    () => false,
  );
  return {
    files,
    status: await git(["status", "--porcelain"]),
    head: (await git(["rev-parse", "HEAD"])).trim(),
    localBranches: await git(["for-each-ref", "refs/heads"]),
    index: hasIndex
      ? createHash("sha256")
          .update(await readFile(indexPath))
          .digest("hex")
      : "",
    stash: await git(["stash", "list"]),
  };
}

// ---------------------------------------------------------------------------
// 常用小工具

export async function readTaskFile(
  fixture: BlogFixture,
  name: string,
): Promise<string> {
  return readFile(join(fixture.folder, name), "utf8");
}

export async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** 假装检查已经全过：按任务文件夹里现在的稿子写一份 .gate.json */
export async function writeGate(
  fixture: BlogFixture,
  overrides: Partial<GateRecord> = {},
): Promise<GateRecord> {
  const draft = await loadDraft(fixture.folder);
  const record: GateRecord = {
    passed: true,
    slug: draft.slug,
    hash: await hashDraft(draft),
    base: await fixture.remoteHead(),
    checkedAt: NOW_ISO,
    ...overrides,
  };
  writeGateRecord(fixture.folder, record);
  return record;
}
