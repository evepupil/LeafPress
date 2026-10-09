/**
 * 联网 git 命令的 ssh 设置：不盖掉作者自己的设置，只在后面追加 -o BatchMode=yes。
 * 找的顺序和 git 自己一样：环境变量 GIT_SSH_COMMAND → 仓库（含全局）配置 core.sshCommand → GIT_SSH → 缺省的 ssh。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  localGitEnv,
  networkGitEnv,
  runBlogGit,
} from "../../../src/platforms/blog/blog-git.js";
import {
  type ExecFn,
  type ExecOptions,
  execCommand,
} from "../../../src/shared/exec.js";
import { stubCleanSshEnv } from "./git-env-support.js";
import { failure, ok, timeout } from "./steps-fixtures.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leafpress-bloggit-"));
  stubCleanSshEnv(dir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

interface RecordedCall {
  command: string;
  args: readonly string[];
  options: ExecOptions | undefined;
}

/**
 * 假的执行函数：git config --get core.sshCommand 返回给定的值（undefined 表示没配），
 * 或者按 fail 超时、抛错；别的命令都成功
 */
function fakeExec(sshCommand?: string, fail?: "timeout" | "throw") {
  const calls: RecordedCall[] = [];
  const exec: ExecFn = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "config") {
      if (fail === "throw") return Promise.reject(new Error("找不到命令 git"));
      if (fail === "timeout") return Promise.resolve(timeout());
      return Promise.resolve(
        sshCommand === undefined ? failure("", 1) : ok(`${sshCommand}\n`),
      );
    }
    return Promise.resolve(ok());
  };
  return {
    exec,
    calls,
    lookups: () => calls.filter((c) => c.args[0] === "config"),
  };
}

describe("networkGitEnv：ssh 命令", () => {
  it("什么都没配：缺省用 ssh -o BatchMode=yes", async () => {
    const { exec } = fakeExec();

    const env = await networkGitEnv(exec, "/repo");

    expect(env["GIT_SSH_COMMAND"]).toBe("ssh -o BatchMode=yes");
  });

  it("仓库里配了 core.sshCommand：用它，后面追加 -o BatchMode=yes", async () => {
    const { exec, lookups } = fakeExec("ssh -i C:/keys/blog_ed25519");

    const env = await networkGitEnv(exec, "/repo");

    expect(env["GIT_SSH_COMMAND"]).toBe(
      "ssh -i C:/keys/blog_ed25519 -o BatchMode=yes",
    );
    // 在作者仓库里查，才能读到仓库自己的配置和全局配置
    expect(lookups()).toHaveLength(1);
    expect(lookups()[0]).toMatchObject({
      command: "git",
      args: ["config", "--get", "core.sshCommand"],
      options: { cwd: "/repo" },
    });
  });

  it("环境变量 GIT_SSH_COMMAND 优先于 core.sshCommand（和 git 一样），而且不用再去查配置", async () => {
    vi.stubEnv("GIT_SSH_COMMAND", "ssh -F C:/me/ssh_config");
    const { exec, lookups } = fakeExec("ssh -i from-config");

    const env = await networkGitEnv(exec, "/repo");

    expect(env["GIT_SSH_COMMAND"]).toBe(
      "ssh -F C:/me/ssh_config -o BatchMode=yes",
    );
    expect(lookups()).toEqual([]);
  });

  it("带引号的完整路径（Windows 自带的 OpenSSH）也只是在后面追加", async () => {
    const { exec } = fakeExec(
      '"C:/Windows/System32/OpenSSH/ssh.exe" -i "C:/Users/me/.ssh/id"',
    );

    const env = await networkGitEnv(exec, "/repo");

    expect(env["GIT_SSH_COMMAND"]).toBe(
      '"C:/Windows/System32/OpenSSH/ssh.exe" -i "C:/Users/me/.ssh/id" -o BatchMode=yes',
    );
  });

  it("只设了 GIT_SSH（程序路径，不能加参数）：不动它，也不设 GIT_SSH_COMMAND", async () => {
    vi.stubEnv("GIT_SSH", "C:/tools/my-ssh.exe");
    const { exec } = fakeExec();

    const env = await networkGitEnv(exec, "/repo");

    expect(env["GIT_SSH"]).toBe("C:/tools/my-ssh.exe");
    expect(env["GIT_SSH_COMMAND"]).toBeUndefined();
  });

  it("GIT_SSH 和 core.sshCommand 都有：core.sshCommand 优先（git 就是这个顺序）", async () => {
    vi.stubEnv("GIT_SSH", "C:/tools/my-ssh.exe");
    const { exec } = fakeExec("ssh -i from-config");

    const env = await networkGitEnv(exec, "/repo");

    expect(env["GIT_SSH_COMMAND"]).toBe("ssh -i from-config -o BatchMode=yes");
  });

  it.each<[string, string | undefined, "timeout" | "throw" | undefined]>([
    ["配置查询超时", undefined, "timeout"],
    ["配置查询起不来", undefined, "throw"],
    ["配置里是空的", "", undefined],
  ])(
    "%s：当作没配，用缺省的 ssh -o BatchMode=yes",
    async (_name, value, fail) => {
      const { exec } = fakeExec(value, fail);

      const env = await networkGitEnv(exec, "/repo");

      expect(env["GIT_SSH_COMMAND"]).toBe("ssh -o BatchMode=yes");
    },
  );

  it("所有联网命令都不许弹出输入口令的提示；本机其余环境变量原样带上", async () => {
    vi.stubEnv("LEAFPRESS_TEST_MARKER", "还在");
    const { exec } = fakeExec();

    for (const env of [await networkGitEnv(exec, "/repo"), localGitEnv()]) {
      expect(env["GIT_TERMINAL_PROMPT"]).toBe("0");
      expect(env["GCM_INTERACTIVE"]).toBe("never");
      expect(env["LEAFPRESS_TEST_MARKER"]).toBe("还在");
    }
  });
});

describe("runBlogGit：只有联网命令才查 ssh 设置", () => {
  it.each<[string[], boolean]>([
    [["-C", "/repo", "fetch", "origin"], true],
    [["fetch", "origin"], true],
    [["push", "origin", "HEAD:main"], true],
    [["-c", "core.quotepath=false", "push", "origin"], true],
    [["checkout", "--detach", "--force", "origin/main"], false],
    [["-C", "/repo", "worktree", "add", "--force", "--detach", "/d"], false],
    [["rebase", "origin/main"], false],
    [["commit", "-m", "fetch"], false],
  ])("git %j → 查询 ssh 设置：%s", async (args, networked) => {
    const { exec, calls, lookups } = fakeExec("ssh -i from-config");

    await runBlogGit(exec, "/repo", args, 1234);

    expect(lookups()).toHaveLength(networked ? 1 : 0);
    const run = calls.at(-1);
    expect(run?.args).toEqual(args);
    expect(run?.options).toMatchObject({
      cwd: "/repo",
      killTree: true,
      timeoutMs: 1234,
    });
    expect(run?.options?.env?.["GIT_SSH_COMMAND"]).toBe(
      networked ? "ssh -i from-config -o BatchMode=yes" : undefined,
    );
  });
});

describe("真的 git：从仓库和全局配置里读 core.sshCommand", () => {
  async function git(args: string[], cwd: string): Promise<void> {
    const result = await execCommand("git", args, { cwd });
    if (result.exitCode !== 0) throw new Error(result.stderr);
  }

  it("临时仓库里配了 core.sshCommand：最后用的命令是它加 -o BatchMode=yes", async () => {
    const repo = join(dir, "repo");
    await git(["init", "-q", repo], dir);
    await git(["config", "core.sshCommand", "ssh -i C:/fake/blog_key"], repo);

    const env = await networkGitEnv(execCommand, repo);

    expect(env["GIT_SSH_COMMAND"]).toBe(
      "ssh -i C:/fake/blog_key -o BatchMode=yes",
    );
  });

  it("只在全局配置里配了 core.sshCommand：同样读得到", async () => {
    stubCleanSshEnv(
      dir,
      "[core]\n\tsshCommand = ssh -F C:/fake/global_config\n",
    );
    const repo = join(dir, "repo2");
    await git(["init", "-q", repo], dir);

    const env = await networkGitEnv(execCommand, repo);

    expect(env["GIT_SSH_COMMAND"]).toBe(
      "ssh -F C:/fake/global_config -o BatchMode=yes",
    );
  });

  it("仓库和全局都没配：缺省的 ssh -o BatchMode=yes", async () => {
    const repo = join(dir, "repo3");
    await git(["init", "-q", repo], dir);

    const env = await networkGitEnv(execCommand, repo);

    expect(env["GIT_SSH_COMMAND"]).toBe("ssh -o BatchMode=yes");
  });
});
