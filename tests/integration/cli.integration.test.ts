import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openStore } from "../../src/store/open.js";

const cliEntry = resolve(process.cwd(), "src/cli/main.ts");
const temporaryDirectories = new Set<string>();

interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface CliFixture {
  readonly root: string;
  readonly home: string;
  readonly userHome: string;
  readonly blog: string;
  readonly remote: string;
}

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.clear();
});

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function writePost(
  blog: string,
  locale: string,
  slug: string,
  metadata: {
    readonly title: string;
    readonly published: string;
    readonly localeCode: string;
    readonly origin?: "notion" | "repo";
    readonly draft?: boolean;
  },
): Promise<void> {
  const directory = join(blog, "content", "posts", locale);
  await mkdir(directory, { recursive: true });
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(metadata.title)}`,
    `published: ${JSON.stringify(metadata.published)}`,
    `locale: ${metadata.localeCode}`,
    ...(metadata.origin === undefined ? [] : [`source: ${metadata.origin}`]),
    ...(metadata.draft === undefined ? [] : [`draft: ${metadata.draft}`]),
    "---",
    "",
    `正文：${metadata.title}`,
    "",
  ].join("\n");
  await writeFile(join(directory, `${slug}.md`), frontmatter, "utf8");
}

async function createCliFixture(): Promise<CliFixture> {
  const root = await mkdtemp(join(tmpdir(), "leafpress-integration-cli-"));
  temporaryDirectories.add(root);
  const home = join(root, "leafpress-home");
  const userHome = join(root, "user-home");
  const blog = join(root, "blog");
  const remote = join(root, "blog-remote.git");
  await Promise.all([
    mkdir(home, { recursive: true }),
    mkdir(userHome, { recursive: true }),
    mkdir(join(blog, "content", "posts"), { recursive: true }),
  ]);

  await writePost(blog, "zh", "notion-source", {
    title: "来自 Notion 的原稿",
    published: "2026-09-30",
    localeCode: "zh-CN",
    origin: "notion",
  });
  await writePost(blog, "zh", "draft-source", {
    title: "中文草稿",
    published: "2026-09-29",
    localeCode: "zh-CN",
    origin: "repo",
    draft: true,
  });
  await writePost(blog, "zh", "broken-metadata", {
    title: "坏元数据文章",
    published: "not-a-date",
    localeCode: "zh-CN",
  });
  await writePost(blog, "en", "english-one", {
    title: "English article one",
    published: "2026-09-28",
    localeCode: "en",
  });
  await writePost(blog, "en", "english-two", {
    title: "English article two",
    published: "2026-09-27",
    localeCode: "en",
  });

  git(root, ["init", "--bare", "--initial-branch=main", remote]);
  git(blog, ["init", "--initial-branch=main"]);
  git(blog, ["add", "--all"]);
  git(blog, [
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    "initial blog content",
  ]);
  git(blog, ["remote", "add", "origin", remote]);
  git(blog, ["push", "--set-upstream", "origin", "main"]);

  return { root, home, userHome, blog, remote };
}

async function runProcess(
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
  },
): Promise<ProcessResult> {
  const child = spawn(executable, [...args], {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 55_000);
  try {
    const code = await new Promise<number | null>((resolveCode, reject) => {
      child.once("error", reject);
      child.once("close", resolveCode);
    });
    if (timedOut)
      throw new Error(`子进程超时：${executable} ${args.join(" ")}`);
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

async function runCli(
  fixture: Pick<CliFixture, "home" | "userHome">,
  args: readonly string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<ProcessResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LEAFPRESS_HOME: fixture.home,
    HOME: fixture.userHome,
    USERPROFILE: fixture.userHome,
    ...extraEnv,
  };
  return runProcess(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: process.cwd(),
    env,
  });
}

async function initialize(fixture: CliFixture): Promise<void> {
  const result = await runCli(fixture, ["init", "--blog", fixture.blog]);
  expect(result.code, result.stderr).toBe(0);
}

async function addRemotePost(
  fixture: CliFixture,
  slug: string,
  title: string,
): Promise<void> {
  const remoteWork = join(fixture.root, `remote-work-${slug}`);
  git(fixture.root, ["clone", "--branch", "main", fixture.remote, remoteWork]);
  await writePost(remoteWork, "zh", slug, {
    title,
    published: "2026-10-01",
    localeCode: "zh-CN",
  });
  git(remoteWork, ["add", "--all"]);
  git(remoteWork, [
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    `add ${slug}`,
  ]);
  git(remoteWork, ["push", "origin", "main"]);
}

describe("真实 CLI 集成", () => {
  it("执行 init、doctor、posts、posts --json 和 run list 完整流程", async () => {
    const fixture = await createCliFixture();
    const initialized = await runCli(fixture, ["init", "--blog", fixture.blog]);
    expect(initialized.code, initialized.stderr).toBe(0);
    expect(initialized.stdout).toContain("初始化完成");

    const doctor = await runCli(fixture, ["doctor"]);
    expect(doctor.code, doctor.stderr).toBe(0);
    expect(doctor.stdout).toContain("检查项");

    const posts = await runCli(fixture, ["posts"]);
    expect(posts.code, posts.stderr).toBe(0);
    expect(posts.stdout).toContain("来自 Notion 的原稿");
    expect(posts.stdout).toContain("中文草稿（草稿）");
    expect(posts.stdout).toContain("知乎·长文");
    expect(posts.stdout).toContain("知乎·回答");
    expect(posts.stdout).toContain("broken-metadata.md");

    const jsonRun = await runCli(fixture, ["posts", "--json"]);
    expect(jsonRun.code, jsonRun.stderr).toBe(0);
    const postsJson: {
      ok: boolean;
      sources: {
        ref: string;
        origin: string;
        draft: boolean;
        targets: { label: string; platform: string; format: string }[];
      }[];
      issues: { path: string; message: string }[];
    } = JSON.parse(jsonRun.stdout) as {
      ok: boolean;
      sources: {
        ref: string;
        origin: string;
        draft: boolean;
        targets: { label: string; platform: string; format: string }[];
      }[];
      issues: { path: string; message: string }[];
    };
    expect(
      postsJson.sources.find((source) => source.ref === "zh/notion-source"),
    ).toMatchObject({ origin: "notion", draft: false });
    expect(
      postsJson.sources.find((source) => source.ref === "zh/draft-source"),
    ).toMatchObject({ origin: "repo", draft: true });
    expect(postsJson.ok).toBe(true);
    expect(postsJson.sources[0]?.targets.map((target) => target.label)).toEqual(
      ["知乎·长文", "知乎·回答"],
    );
    expect(postsJson.sources[0]?.targets).toEqual([
      expect.objectContaining({ platform: "zhihu", format: "article" }),
      expect.objectContaining({ platform: "zhihu", format: "answer" }),
    ]);
    expect(postsJson.issues).toHaveLength(1);
    expect(postsJson.issues[0]?.path).toContain("broken-metadata.md");

    const runs = await runCli(fixture, ["run", "list"]);
    expect(runs.code, runs.stderr).toBe(0);
    expect(runs.stdout.trim()).toBe("没有未结束的运行");

    const runsJson = await runCli(fixture, ["run", "list", "--json"]);
    expect(runsJson.code, runsJson.stderr).toBe(0);
    expect(JSON.parse(runsJson.stdout)).toEqual({ ok: true, runs: [] });
  }, 60_000);

  it("posts 连续执行不增加原稿记录，并行执行后 SQLite 仍可读取", async () => {
    const fixture = await createCliFixture();
    await initialize(fixture);
    const first = await runCli(fixture, ["posts"]);
    expect(first.code, first.stderr).toBe(0);
    const second = await runCli(fixture, ["posts"]);
    expect(second.code, second.stderr).toBe(0);

    const store = openStore(join(fixture.home, "leafpress.db"));
    const originalCount = store.sources.list("blog").length;
    store.close();
    expect(originalCount).toBe(2);

    const simultaneous = await Promise.all([
      runCli(fixture, ["posts"]),
      runCli(fixture, ["posts"]),
    ]);
    expect(simultaneous.map((result) => result.code)).toEqual([0, 0]);
    for (const result of simultaneous) expect(result.stderr).toBe("");

    const reopened = openStore(join(fixture.home, "leafpress.db"));
    expect(reopened.sources.list("blog")).toHaveLength(originalCount);
    reopened.close();
  }, 60_000);

  it("posts --sync 快进拉取远程原稿，并在本地有改动时保持 HEAD 不变", async () => {
    const fixture = await createCliFixture();
    await initialize(fixture);
    await addRemotePost(fixture, "remote-added", "远程新增原稿");

    const synced = await runCli(fixture, ["posts", "--sync", "--json"]);
    expect(synced.code, synced.stderr).toBe(0);
    const syncedJson = JSON.parse(synced.stdout) as {
      sync: { action: string; message: string };
      sources: { ref: string }[];
    };
    expect(syncedJson.sync.action).toBe("fast-forwarded");
    expect(syncedJson.sync.message).toContain("快进到远程最新");
    expect(
      syncedJson.sources.some((source) => source.ref === "zh/remote-added"),
    ).toBe(true);

    await addRemotePost(fixture, "remote-added-again", "远程再次新增");
    await writeFile(
      join(fixture.blog, "content", "posts", "zh", "notion-source.md"),
      "本地未提交改动\n",
      "utf8",
    );
    const before = git(fixture.blog, ["rev-parse", "HEAD"]).trim();
    const skipped = await runCli(fixture, ["posts", "--sync", "--json"]);
    expect(skipped.code, skipped.stderr).toBe(0);
    const skippedJson = JSON.parse(skipped.stdout) as {
      sync: { action: string; message: string };
    };
    const after = git(fixture.blog, ["rev-parse", "HEAD"]).trim();
    expect(skippedJson.sync.action).toBe("skipped-dirty");
    expect(skippedJson.sync.message).toContain("没有动仓库");
    expect(after).toBe(before);
  }, 60_000);

  it("配置缺失返回规定错误和 JSON，未知选项返回用法退出码", async () => {
    const root = await mkdtemp(join(tmpdir(), "leafpress-integration-error-"));
    temporaryDirectories.add(root);
    const fixture = {
      home: join(root, "leafpress-home"),
      userHome: join(root, "user-home"),
    };
    await Promise.all([
      mkdir(fixture.home, { recursive: true }),
      mkdir(fixture.userHome, { recursive: true }),
    ]);

    const human = await runCli(fixture, ["posts"]);
    expect(human.code).toBe(1);
    expect(human.stderr).toContain("错误：");
    expect(human.stderr).toContain("提示：");

    const json = await runCli(fixture, ["posts", "--json"]);
    expect(json.code).toBe(1);
    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: false,
      error: { code: "CONFIG_MISSING" },
    });

    const usage = await runCli(fixture, ["posts", "--unknown-option"]);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("错误：");
  }, 60_000);

  it("doctor 的人类和 JSON 输出都不泄漏密钥值", async () => {
    const fixture = await createCliFixture();
    await initialize(fixture);
    const configPath = join(fixture.home, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      zhihu: Record<string, unknown>;
    };
    config.zhihu["developerAccessSecret"] = "SECRET-integ-dev-config";
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const sharedCredentialDirectory = join(fixture.userHome, ".zhihu");
    await mkdir(sharedCredentialDirectory, { recursive: true });
    await writeFile(
      join(sharedCredentialDirectory, "openapi-credentials.json"),
      JSON.stringify({
        ZHIHU_OPENAPI_APP_KEY: "integration-file-user",
        ZHIHU_OPENAPI_APP_SECRET: "SECRET-integ-app-file",
      }),
      "utf8",
    );
    const credentialEnv = {
      ZHIHU_OPENAPI_APP_KEY: "integration-env-user",
      ZHIHU_OPENAPI_APP_SECRET: "SECRET-integ-app-env",
      ZHIHU_DEVELOPER_ACCESS_SECRET: "SECRET-integ-dev-env",
    };
    const forbiddenValues = [
      "SECRET-integ-app-file",
      "SECRET-integ-app-env",
      "SECRET-integ-dev-config",
      "SECRET-integ-dev-env",
    ];

    for (const args of [["doctor"], ["doctor", "--json"]]) {
      const result = await runCli(fixture, args, credentialEnv);
      expect(result.code, result.stderr).toBe(0);
      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      for (const secret of forbiddenValues) {
        expect(combinedOutput).not.toContain(secret);
      }
    }
  }, 60_000);
});
