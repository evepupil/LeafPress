/**
 * git 状态与快进拉取的测试。
 *
 * 原理：全部用真实 git 在临时目录里造「远程裸仓库 + 本地克隆」，
 * 提交时用 -c user.name=test -c user.email=test@example.com，不依赖本机 git 配置；
 * 测完删掉临时目录，不碰任何真实仓库。
 */
import { createHash } from "node:crypto";
import { execFile as execFileCb } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { execCommand, type ExecFn } from "../../../src/shared/exec.js";
import { syncRepo } from "../../../src/platforms/blog/git.js";
import {
  readRepoStatus,
  type RepoStatus,
} from "../../../src/platforms/blog/repo-status.js";
import type { SyncResult } from "../../../src/platforms/types.js";

/**
 * 一条用例要连着起十几个真实 git 进程。Windows 上单个进程就要几百毫秒，
 * 和别的测试文件并行跑时很容易超过默认的 5 秒，所以这两组单独放宽到 30 秒。
 */
const REAL_GIT_TIMEOUT_MS = 30_000;

const execFile = promisify(execFileCb);

/** 本机可用的 git 命令行（不依赖全局配置） */
const GIT = "git";

async function git(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execCommand(GIT, args, { cwd });
  return result;
}

/** 带作者信息的提交：不依赖本机 git 全局配置 */
async function commitAll(cwd: string, message: string): Promise<void> {
  const result = await git(cwd, [
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-a",
    "-m",
    message,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`git commit 失败：${result.stderr}`);
  }
}

/** 改一个已跟踪文件的内容 */
async function touch(
  cwd: string,
  file: string,
  content: string,
): Promise<void> {
  await writeFile(join(cwd, file), content, "utf8");
  await git(cwd, ["add", file]);
}

let baseDir: string;
let remotePath: string;
let localPath: string;

async function makeRepo(): Promise<void> {
  // 远程裸仓库
  remotePath = join(baseDir, "remote.git");
  await git(baseDir, ["init", "--bare", remotePath]);
  // 本地克隆
  localPath = join(baseDir, "local");
  await git(baseDir, ["clone", remotePath, localPath]);
  // 初始提交，建立 main 分支
  await touch(localPath, "README.md", "# blog\n");
  await commitAll(localPath, "init");
  await git(localPath, ["push", "origin", "HEAD"]);
}

/** 本地 HEAD 指向的提交号 */
async function head(cwd: string): Promise<string> {
  const result = await git(cwd, ["rev-parse", "HEAD"]);
  if (result.exitCode !== 0)
    throw new Error(`rev-parse 失败：${result.stderr}`);
  return result.stdout.trim();
}

/** 把本地快进对齐到 origin/main，让每个用例从干净的同步状态开始 */
async function catchUp(): Promise<void> {
  await git(localPath, ["reset", "--hard", "origin/main"]);
}

beforeAll(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "leafpress-git-"));
  await makeRepo();
}, REAL_GIT_TIMEOUT_MS);

afterAll(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

async function runSync(): Promise<SyncResult> {
  return syncRepo(execCommand, localPath, "origin", "main");
}

describe(
  "syncRepo（真实 git，临时仓库）",
  { timeout: REAL_GIT_TIMEOUT_MS },
  () => {
    it("本地落后：快进到远程，HEAD 与远程一致", async () => {
      // 远程先走一步
      await touch(localPath, "README.md", "# blog v2\n");
      await commitAll(localPath, "remote-advance");
      await git(localPath, ["push", "origin", "HEAD"]);
      // 把本地退回上一个提交，制造「落后」
      await git(localPath, ["reset", "--hard", "HEAD~1"]);

      // 模拟远程跟踪分支落后：把本地的 origin/main 也退回去，
      // 只靠 fetch 更新 refs/remotes/origin/main 才能算出 behind=1
      await git(localPath, [
        "update-ref",
        "refs/remotes/origin/main",
        await head(localPath),
      ]);

      const before = await head(localPath);
      const result = await runSync();

      expect(result.action).toBe("fast-forwarded");
      expect(result.behindBefore).toBe(1);
      expect(result.aheadBefore).toBe(0);
      expect(result.branch).toBe("main");
      expect(await head(localPath)).not.toBe(before);
      // 本地 HEAD 现在与 origin/main 一致
      const remoteHead = await git(localPath, ["rev-parse", "origin/main"]);
      expect(await head(localPath)).toBe(remoteHead.stdout.trim());
    });

    it("远程跟踪分支不存在时（无 fetch 配置的克隆）：fetch 后能算出 behind 并快进", async () => {
      // 远程走一步
      await touch(localPath, "README.md", "# blog v2b\n");
      await commitAll(localPath, "remote-advance-2");
      await git(localPath, ["push", "origin", "HEAD"]);
      // 本地退回上一个提交
      await git(localPath, ["reset", "--hard", "HEAD~1"]);
      // 删掉远程跟踪分支，模拟「克隆时没建 fetch 配置、 refs/remotes/origin/main 不存在」
      await git(localPath, ["update-ref", "-d", "refs/remotes/origin/main"]);
      const gone = await git(localPath, [
        "rev-parse",
        "--verify",
        "refs/remotes/origin/main",
      ]);
      expect(gone.exitCode).not.toBe(0);

      const result = await runSync();

      // fetch 写明 refspec 后远程跟踪分支被补上，behind 算得出来，快进成功
      expect(result.action).toBe("fast-forwarded");
      expect(result.behindBefore).toBe(1);
      const remoteHead = await git(localPath, [
        "rev-parse",
        "refs/remotes/origin/main",
      ]);
      expect(await head(localPath)).toBe(remoteHead.stdout.trim());
    });

    it("仓库里有叫 origin/main 的本地分支：仍按远程跟踪分支比较和合并", async () => {
      await catchUp();
      // 造一个同名本地分支，短名 origin/main 会被它抢走，必须用全限定 ref 才对
      await git(localPath, ["branch", "origin/main", "HEAD"]);
      // 远程走一步，本地退回，制造「落后」
      await touch(localPath, "README.md", "# v5\n");
      await commitAll(localPath, "remote-v5");
      await git(localPath, ["push", "origin", "HEAD"]);
      await git(localPath, ["reset", "--hard", "HEAD~1"]);

      const result = await runSync();

      // 若解析到本地分支 origin/main，会误判成 up-to-date；正确行为是快进
      expect(result.action).toBe("fast-forwarded");
      expect(result.behindBefore).toBe(1);
      const remoteHead = await git(localPath, [
        "rev-parse",
        "refs/remotes/origin/main",
      ]);
      expect(await head(localPath)).toBe(remoteHead.stdout.trim());
      // 清掉同名分支，供后续用例
      await git(localPath, ["branch", "-D", "origin/main"]);
    });

    it("已经最新：up-to-date，不动仓库", async () => {
      const before = await head(localPath);
      const result = await runSync();
      expect(result.action).toBe("up-to-date");
      expect(result.behindBefore).toBe(0);
      expect(result.aheadBefore).toBe(0);
      expect(await head(localPath)).toBe(before);
    });

    it("工作区有改动：skipped-dirty，不动仓库", async () => {
      await catchUp();
      // 远程走一步，本地留一个未提交改动
      await touch(localPath, "README.md", "# blog v3\n");
      await commitAll(localPath, "v3");
      await git(localPath, ["push", "origin", "HEAD"]);
      await git(localPath, ["reset", "--hard", "HEAD~1"]);
      await touch(localPath, "README.md", "# 本地未提交\n");
      const before = await head(localPath);

      const result = await runSync();

      expect(result.action).toBe("skipped-dirty");
      expect(result.behindBefore).toBe(1);
      expect(result.aheadBefore).toBe(0);
      expect(await head(localPath)).toBe(before);
      // 改动还在
      expect(await readFile(join(localPath, "README.md"), "utf8")).toBe(
        "# 本地未提交\n",
      );
      // 清理改动，供后续用例
      await git(localPath, ["reset", "--hard", "HEAD"]);
    });

    it("本地有未推送提交：skipped-ahead，不动仓库", async () => {
      await catchUp();
      const before = await head(localPath);
      await touch(localPath, "README.md", "# 本地领先\n");
      await commitAll(localPath, "local-ahead");

      const result = await runSync();

      expect(result.action).toBe("skipped-ahead");
      expect(result.aheadBefore).toBe(1);
      expect(result.behindBefore).toBe(0);
      expect(await head(localPath)).not.toBe(before);
      // 仍然是本地那个提交，没有被远程覆盖
      const log = await git(localPath, ["log", "-1", "--format=%s"]);
      expect(log.stdout.trim()).toBe("local-ahead");
    });

    it("分叉：skipped-diverged，不动仓库", async () => {
      await catchUp();
      // 先让本地领先一个提交
      await touch(localPath, "README.md", "# 本地分叉\n");
      await commitAll(localPath, "diverge-local");
      // 再让远程领先一个提交（从远程当前 HEAD 直接推到裸仓库）
      const remoteWork = join(baseDir, "remote-work");
      await git(baseDir, ["clone", remotePath, remoteWork]);
      await touch(remoteWork, "OTHER.md", "远程改动\n");
      await commitAll(remoteWork, "diverge-remote");
      await git(remoteWork, ["push", "origin", "HEAD"]);
      const before = await head(localPath);

      const result = await runSync();

      expect(result.action).toBe("skipped-diverged");
      expect(result.aheadBefore).toBe(1);
      expect(result.behindBefore).toBe(1);
      expect(await head(localPath)).toBe(before);
      // 清掉本地那个提交，供后续用例
      await git(localPath, ["reset", "--hard", "origin/main"]);
    });

    it("远程目录被删掉导致拉取失败：failed 且不动仓库", async () => {
      // 把远程裸仓库改名，模拟远程不可达
      const hiddenRemote = `${remotePath}.hidden`;
      await rename(remotePath, hiddenRemote);
      const before = await head(localPath);

      const result = await runSync();

      expect(result.action).toBe("failed");
      // 拉 取 失败的 message 要附上抹掉口令后的 stderr 第一行
      expect(result.message).toContain("拉取失败");
      expect(result.message).not.toBe("拉取失败：git fetch 没有输出错误信息");
      expect(await head(localPath)).toBe(before);

      // 改回来，供后续用例
      await rename(hiddenRemote, remotePath);
    });

    it("拉取超时：message 含超时秒数，有 stderr 时也附上（注入假 exec，不用等真 60 秒）", async () => {
      const calls: Array<{ args: readonly string[] }> = [];
      const fakeExec: ExecFn = (command, args) => {
        void command;
        calls.push({ args });
        const isFetch = args.includes("fetch");
        if (isFetch) {
          // 模拟被超时杀掉：没有退出码、timedOut 为真，带一点 stderr
          return Promise.resolve({
            stdout: "",
            stderr: "fatal: 无法访问远程",
            exitCode: -1,
            timedOut: true,
          });
        }
        if (args.includes("--abbrev-ref")) {
          return Promise.resolve({
            stdout: "main\n",
            stderr: "",
            exitCode: 0,
            timedOut: false,
          });
        }
        return Promise.resolve({
          stdout: "",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        });
      };

      const result = await syncRepo(fakeExec, localPath, "origin", "main");

      expect(result.action).toBe("failed");
      expect(result.message).toContain("拉取超时（60 秒）");
      // stderr 有内容时要附上（口令已抹掉）
      expect(result.message).toContain("无法访问远程");
      // fetch 用的是显式 refspec
      const fetchCall = calls.find((c) => c.args.includes("fetch"));
      expect(fetchCall?.args).toContain(
        "+refs/heads/main:refs/remotes/origin/main",
      );
    });

    it("拉取失败时挑最能看到原因的一行：优先 fatal:/error:，跳过 bash 警告杂音，抹掉口令", async () => {
      const makeFakeExec = (stderr: string): ExecFn => {
        return (command, args) => {
          void command;
          if (args.includes("--abbrev-ref")) {
            return Promise.resolve({
              stdout: "main\n",
              stderr: "",
              exitCode: 0,
              timedOut: false,
            });
          }
          if (args.includes("fetch")) {
            return Promise.resolve({
              stdout: "",
              stderr,
              exitCode: 128,
              timedOut: false,
            });
          }
          return Promise.resolve({
            stdout: "",
            stderr: "",
            exitCode: 0,
            timedOut: false,
          });
        };
      };

      // 场景一：杂音在前面，真正原因在后面的 fatal: 行
      const withFatal = await syncRepo(
        makeFakeExec(
          "bash.exe: warning: could not find /tmp, please create!\nfatal: 无法访问 'https://user:secret@example.com/'：域名解析失败\n",
        ),
        localPath,
        "origin",
        "main",
      );
      expect(withFatal.message).toContain("fatal: 无法访问");
      expect(withFatal.message).not.toContain("bash.exe");
      expect(withFatal.message).not.toContain("secret");

      // 场景二：没有 fatal:/error:，取第一条非 bash 警告的非空行
      const noFatal = await syncRepo(
        makeFakeExec(
          "bash: warning: could not find /tmp, please create!\nERROR: repository not found（没有冒号前缀的普通行）\n",
        ),
        localPath,
        "origin",
        "main",
      );
      expect(noFatal.message).toContain("repository not found");
      expect(noFatal.message).not.toContain("bash");

      // 场景三：全是杂音行，退到 fallback 文案
      const allNoise = await syncRepo(
        makeFakeExec(
          "bash.exe: warning: could not find /tmp, please create!\n",
        ),
        localPath,
        "origin",
        "main",
      );
      expect(allNoise.message).toContain("git fetch 没有输出错误信息");
    });

    it("当前分支不对：failed，message 说明两边分支，不动仓库", async () => {
      // 建一个别的分支并切过去
      await git(localPath, ["switch", "-c", "feature"]);
      const before = await head(localPath);

      const result = await syncRepo(execCommand, localPath, "origin", "main");

      expect(result.action).toBe("failed");
      expect(result.message).toContain("feature");
      expect(result.message).toContain("main");
      expect(await head(localPath)).toBe(before);
      await git(localPath, ["switch", "main"]);
      await git(localPath, ["branch", "-d", "feature"]);
    });
  },
);

describe("readRepoStatus（不联网）", { timeout: REAL_GIT_TIMEOUT_MS }, () => {
  it("正常仓库：返回分支、ahead/behind、dirty", async () => {
    await catchUp();
    const status = await readRepoStatus(
      execCommand,
      localPath,
      "origin",
      "main",
    );
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe("main");
    expect(status.hasUpstream).toBe(true);
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    expect(status.dirty).toBe(false);
  });

  it("有未提交改动时 dirty 为 true", async () => {
    await catchUp();
    await touch(localPath, "README.md", "# 脏了\n");
    const status = await readRepoStatus(
      execCommand,
      localPath,
      "origin",
      "main",
    );
    expect(status.dirty).toBe(true);
    await git(localPath, ["reset", "--hard", "HEAD"]);
  });

  it("本地领先时 ahead 正确", async () => {
    await catchUp();
    await touch(localPath, "README.md", "# 领先\n");
    await commitAll(localPath, "ahead-1");
    const status = await readRepoStatus(
      execCommand,
      localPath,
      "origin",
      "main",
    );
    expect(status.ahead).toBe(1);
    await git(localPath, ["reset", "--hard", "HEAD~1"]);
  });

  it("按传入的 remote/branch 算：远程跟踪分支落后时 behind 正确，与 syncRepo 同一比较对象", async () => {
    await catchUp();
    // 远程走一步，本地退回，再把远程跟踪分支也退回（模拟「跟踪分支陈旧」）
    await touch(localPath, "README.md", "# v4\n");
    await commitAll(localPath, "remote-v4");
    await git(localPath, ["push", "origin", "HEAD"]);
    await git(localPath, ["reset", "--hard", "HEAD~1"]);
    await git(localPath, [
      "update-ref",
      "refs/remotes/origin/main",
      await head(localPath),
    ]);

    // HEAD 与 refs/remotes/origin/main 同步 → ahead/behind 都是 0
    const aligned = await readRepoStatus(
      execCommand,
      localPath,
      "origin",
      "main",
    );
    expect(aligned.ahead).toBe(0);
    expect(aligned.behind).toBe(0);
    expect(aligned.hasUpstream).toBe(true);

    // fetch 更新远程跟踪分支后 → behind 1，与 syncRepo 的比较对象一致
    await git(localPath, [
      "fetch",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ]);
    const fetched = await readRepoStatus(
      execCommand,
      localPath,
      "origin",
      "main",
    );
    expect(fetched.behind).toBe(1);
    expect(fetched.ahead).toBe(0);
    await catchUp();
  });

  it("远程跟踪分支不存在时 hasUpstream 为 false、ahead/behind 为 0", async () => {
    await catchUp();
    await git(localPath, ["update-ref", "-d", "refs/remotes/origin/main"]);
    const status = await readRepoStatus(
      execCommand,
      localPath,
      "origin",
      "main",
    );
    expect(status.isRepo).toBe(true);
    expect(status.hasUpstream).toBe(false);
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    // 恢复跟踪分支，供后续用例
    await git(localPath, [
      "fetch",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ]);
  });

  it("不是 git 仓库：isRepo false，其余默认值，不抛错", async () => {
    const plain = join(baseDir, "plain");
    await mkdir(plain, { recursive: true });
    const status: RepoStatus = await readRepoStatus(
      execCommand,
      plain,
      "origin",
      "main",
    );
    expect(status).toEqual({
      isRepo: false,
      dirty: false,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
    });
  });

  it("路径存在但不是目录（同名文件）：isRepo false，不调 git，不抛错", async () => {
    const notDir = join(baseDir, "not-a-dir");
    await writeFile(notDir, "这是个文件", "utf8");
    const status: RepoStatus = await readRepoStatus(
      execCommand,
      notDir,
      "origin",
      "main",
    );
    expect(status).toEqual({
      isRepo: false,
      dirty: false,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
    });
  });
});

describe("git.ts 用到的工具", () => {
  it("execFile 兜底确认：git 在本机可用", async () => {
    const { stdout } = await execFile(GIT, ["--version"]);
    expect(stdout).toMatch(/^git version/);
  });

  it("--no-optional-locks：readRepoStatus 前后 .git/index 哈希不变（不触发可选锁改写）", async () => {
    await catchUp();
    // 把已跟踪文件的修改时间往后拨，诱导 git status 顺手刷新 index
    const readme = join(localPath, "README.md");
    const future = new Date(Date.now() + 10 * 60 * 1000);
    await utimes(readme, future, future);
    const indexPath = join(localPath, ".git", "index");
    const hashBefore = createHash("sha256")
      .update(readFileSync(indexPath))
      .digest("hex");

    await readRepoStatus(execCommand, localPath, "origin", "main");

    const hashAfter = createHash("sha256")
      .update(readFileSync(indexPath))
      .digest("hex");
    expect(hashAfter).toBe(hashBefore);
  });
});
