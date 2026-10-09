import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
  Account,
  AddIdeaInput,
  Idea,
  RunResult,
  UseCases,
  Work,
  WorkDetail,
} from "@leafpress/core";
import { describe, expect, it, vi } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { buildProgram, formatCommandError, main } from "../../src/cli/main.js";
import { LeafPressError } from "../../src/shared/errors.js";

function cast<T>(value: unknown): T {
  return value as T;
}

function fakeUseCases(value: object): UseCases {
  return cast<UseCases>(value);
}

async function capture(run: () => Promise<void>) {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  };
  try {
    await run();
    return { stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("CLI 入口", () => {
  it("登记规格中的顶层命令和 work 子命令", () => {
    const program = buildProgram();
    expect(program.commands.map((command) => command.name())).toEqual([
      "init",
      "doctor",
      "serve",
      "works",
      "work",
      "convert",
      "ideas",
      "accounts",
      "account",
      "data",
      "report",
      "schedule",
      "export",
      "skill",
    ]);
    const data = program.commands.find((command) => command.name() === "data");
    expect(data?.commands.map((command) => command.name())).toEqual([
      "pull",
      "show",
    ]);
    expect(
      data?.commands
        .find((command) => command.name() === "pull")
        ?.options.map((option) => option.long),
    ).toContain("--scheduled");
    const schedule = program.commands.find(
      (command) => command.name() === "schedule",
    );
    expect(schedule?.commands.map((command) => command.name())).toEqual([
      "install",
      "remove",
      "status",
    ]);
    expect(
      schedule?.commands
        .find((command) => command.name() === "install")
        ?.options.map((option) => option.long),
    ).toContain("--at");
    const report = program.commands.find(
      (command) => command.name() === "report",
    );
    expect(report?.options.map((option) => option.long)).toContain("--week");
    const work = program.commands.find((command) => command.name() === "work");
    expect(work?.commands.map((command) => command.name())).toEqual([
      "show",
      "next",
      "start",
      "step",
      "run",
      "back",
      "release",
      "feedback",
      "new",
    ]);
  });

  it("--version 不创建上下文，且只动态加载命令实现", async () => {
    const previous = process.exitCode;
    const createContext = vi.fn(() => {
      throw new Error("不该建上下文");
    });
    const output = await capture(() => main(["--version"], { createContext }));
    expect(output.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);
    expect(output.stderr).toBe("");
    expect(createContext).not.toHaveBeenCalled();
    process.exitCode = previous;
  });

  it("help 子命令正常退出且 JSON 模式不输出错误壳", async () => {
    const previous = process.exitCode;
    for (const args of [
      ["help"],
      ["help", "work"],
      ["--json", "help", "work"],
    ]) {
      const output = await capture(() => main(args));
      expect(process.exitCode).toBe(0);
      expect(output.stdout).toContain("Usage:");
      expect(output.stdout).not.toContain('"ok": false');
      expect(output.stderr).toBe("");
    }
    process.exitCode = previous;
  });

  it("通过命令行解析自由文字、逗号列表和用法错误", async () => {
    const previous = process.exitCode;
    const feedback = vi.fn(() => cast<Work>({ id: "w-1" }));
    const addIdeas = vi.fn((inputs: AddIdeaInput[]) =>
      inputs.map((input, index) =>
        cast<Idea>({ id: `i-${index + 1}`, ...input, status: "inbox" }),
      ),
    );
    const account = cast<Account>({
      id: "zhihu-1",
      platform: "zhihu",
      name: "知乎账号",
      profile: "",
    });
    const secondAccount = cast<Account>({
      id: "blog-1",
      platform: "blog",
      name: "博客账号",
      profile: "",
    });
    const baseWork = cast<Work>({
      id: "w-1",
      accountId: account.id,
      title: "测试",
      status: "todo",
      step: 0,
      workflowId: "general-write",
    });
    const baseDetail = cast<WorkDetail>({
      work: baseWork,
      context: "上下文",
      account,
      platform: { id: "zhihu", name: "知乎" },
      workflow: { id: "general-write", name: "通用写稿" },
    });
    const createWorks = vi.fn((input: { accountIds: string[] }) =>
      input.accountIds.map((accountId, index) =>
        cast<Work>({ ...baseWork, id: `w-${index + 1}`, accountId }),
      ),
    );
    const context = createCliContext(
      { json: true },
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases({
          submitFeedback: feedback,
          addIdeas,
          listIdeas: vi.fn(() => [cast<Idea>({ id: "i-1", text: "源灵感" })]),
          createWorks,
          listAccounts: vi.fn(() => [account, secondAccount]),
          showWork: vi.fn((id: string) => ({
            ...baseDetail,
            work: { ...baseWork, id },
          })),
        }),
      },
    );
    const createContext = vi.fn(() => context);
    try {
      process.exitCode = 0;
      const feedbackOutput = await capture(() =>
        main(["--json", "work", "feedback", "w-1", "已发布", "链接如下"], {
          createContext,
        }),
      );
      expect(JSON.parse(feedbackOutput.stdout)).toMatchObject({ ok: true });
      expect(feedback).toHaveBeenLastCalledWith("w-1", "已发布 链接如下");

      await capture(() =>
        main(["--json", "work", "feedback", "w-1", "--", "- 把第二段删掉"], {
          createContext,
        }),
      );
      expect(feedback).toHaveBeenLastCalledWith("w-1", "- 把第二段删掉");

      await capture(() =>
        main(["--json", "ideas", "add", "--", "-3度的冬天"], {
          createContext,
        }),
      );
      expect(addIdeas).toHaveBeenLastCalledWith([
        expect.objectContaining({ text: "-3度的冬天", source: "quick" }),
      ]);

      const badOption = await capture(() =>
        main(["--json", "ideas", "add", "-3度的冬天"], { createContext }),
      );
      expect(process.exitCode).toBe(2);
      const badOptionResult = JSON.parse(badOption.stdout) as {
        ok: boolean;
        error?: { code?: string; hint?: string };
      };
      expect(badOptionResult.ok).toBe(false);
      expect(badOptionResult.error?.code).toBe("USAGE");
      expect(badOptionResult.error?.hint).toContain(
        "文字以 - 开头时，在前面加 --",
      );

      await capture(() =>
        main(["--json", "convert", "i-1", "--to", "zhihu-1,blog-1"], {
          createContext,
        }),
      );
      expect(createWorks.mock.calls.at(-1)?.[0].accountIds).toEqual([
        "zhihu-1",
        "blog-1",
      ]);

      await capture(() =>
        main(
          [
            "--json",
            "work",
            "new",
            "--account",
            "zhihu-1,blog-1",
            "--title",
            "双账号作品",
          ],
          { createContext },
        ),
      );
      expect(createWorks.mock.calls.at(-1)?.[0].accountIds).toEqual([
        "zhihu-1",
        "blog-1",
      ]);

      const invalidSource = await capture(() =>
        main(["--json", "ideas", "add", "文本", "--source", "invalid"], {
          createContext,
        }),
      );
      expect(process.exitCode).toBe(2);
      const invalidSourceResult = JSON.parse(invalidSource.stdout) as {
        ok: boolean;
        error?: { code?: string; message?: string };
      };
      expect(invalidSourceResult.ok).toBe(false);
      expect(invalidSourceResult.error?.code).toBe("USAGE");
      expect(invalidSourceResult.error?.message).toContain("来源不合法");
    } finally {
      process.exitCode = previous;
    }
  });

  it("work run 步骤失败时 JSON 仍是成功外壳、退出码为 1", async () => {
    const previous = process.exitCode;
    const failedRun = cast<RunResult>({
      message: "出错了：归档服务不可用",
      lease: { token: "lease", expiresAt: "2026-10-09T12:30:00.000Z" },
      detail: cast<WorkDetail>({ work: { id: "w-1" } }),
      outcome: { kind: "fail", error: "归档服务不可用" },
    });
    const context = createCliContext(
      { json: true },
      {
        env: {},
        homedir: ".",
        useCases: fakeUseCases({
          runWork: vi.fn(() => Promise.resolve(failedRun)),
        }),
      },
    );
    try {
      process.exitCode = 0;
      const output = await capture(() =>
        main(["--json", "work", "run", "w-1", "--lease", "lease"], {
          createContext: () => context,
        }),
      );
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(output.stdout)).toMatchObject({
        ok: true,
        message: "出错了：归档服务不可用",
        outcome: { kind: "fail", error: "归档服务不可用" },
      });
      const missingLease = await capture(() =>
        main(["--json", "work", "run", "w-1"], {
          createContext: () => context,
        }),
      );
      expect(process.exitCode).toBe(2);
      const missingLeaseResult = JSON.parse(missingLease.stdout) as {
        ok: boolean;
        error?: { code?: string; message?: string };
      };
      expect(missingLeaseResult.ok).toBe(false);
      expect(missingLeaseResult.error?.code).toBe("USAGE");
      expect(missingLeaseResult.error?.message).toContain("--lease");
    } finally {
      process.exitCode = previous;
    }
  });

  it("翻译参数错误并保持正确退出码和 JSON 外壳", async () => {
    const previous = process.exitCode;
    const output = await capture(() => main(["--json", "work", "back", "x"]));
    const parsed = JSON.parse(output.stdout) as unknown;
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: "USAGE" },
    });
    expect(JSON.stringify(parsed)).toContain("缺少必需选项");
    expect(output.stderr).toBe("");
    expect(process.exitCode).toBe(2);

    const formatted = formatCommandError(
      new LeafPressError("STORE_FAILED", "记录库失败", { hint: "检查目录" }),
      false,
    );
    expect(formatted).toEqual({
      text: "错误：记录库失败\n提示：检查目录",
      stream: "stderr",
      exitCode: 1,
    });
    process.exitCode = previous;
  });

  it("根帮助列出命令且没有命令时返回用法错误", () => {
    const program = buildProgram();
    expect(program.helpInformation()).toContain("skill");
    const previous = process.exitCode;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url)),
        "--help",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("work");
    expect(result.stdout).toContain("serve");
    expect(process.exitCode).toBe(previous);
  });

  it("未知命令是具体的用法错误", async () => {
    const previous = process.exitCode;
    const output = await capture(() => main(["--json", "run"]));
    expect(JSON.parse(output.stdout)).toMatchObject({
      ok: false,
      error: { code: "USAGE", message: "命令行参数不正确：未知命令 run。" },
    });
    expect(process.exitCode).toBe(2);
    process.exitCode = previous;
  });
});
