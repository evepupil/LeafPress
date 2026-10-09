import { execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(repoRoot, "dist", "cli", "main.js");
let home: string;

beforeAll(() => {
  execSync("pnpm build", {
    cwd: repoRoot,
    stdio: "pipe",
    timeout: 120_000,
  });
  home = mkdtempSync(join(tmpdir(), "leafpress-cli-flow-"));
}, 120_000);

afterAll(() => {
  if (home !== undefined) rmSync(home, { recursive: true, force: true });
});

function runCli(args: readonly string[], input?: string) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, LEAFPRESS_DEBUG: "1" },
    ...(input === undefined ? {} : { input }),
  });
}

function invoke(args: readonly string[], expectJson = false): string {
  const result = runCli([...args, "--home", home]);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  if (expectJson) return JSON.stringify(JSON.parse(result.stdout) as unknown);
  return result.stdout;
}

describe("已构建 CLI 端到端流程", () => {
  it("构建产物 --version 子进程不加载重模块", () => {
    const temp = mkdtempSync(join(tmpdir(), "leafpress-cli-loads-"));
    const log = join(temp, "modules.json");
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("../cli/load-tracker.mjs"),
          join(repoRoot, "dist", "cli", "main.js"),
          "--version",
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: { ...process.env, LEAFPRESS_MODULE_LOG: log },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);
      expect(JSON.parse(readFileSync(log, "utf8")) as string[]).toEqual([]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("入口帮助、版本和未初始化只读命令不创建数据", () => {
    const help = runCli(["--home", home, "--help"]);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("个人内容工作台命令行");
    expect(existsSync(join(home, "config.json"))).toBe(false);

    const helpCommands = [
      ["help"],
      ["help", "work"],
      ["--json", "help", "work"],
    ];
    for (const args of helpCommands) {
      const result = runCli(["--home", home, ...args]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("Usage:");
    }

    const version = runCli(["--version"]);
    expect(version.status, version.stderr).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);

    for (const args of [
      ["works"],
      ["ideas"],
      ["accounts"],
      ["work", "show", "w-1"],
      ["account", "show", "zhihu-1"],
    ]) {
      const readonly = runCli(["--home", home, "--json", ...args]);
      expect(readonly.status).toBe(2);
      expect(JSON.parse(readonly.stdout) as unknown).toMatchObject({
        ok: false,
        error: {
          code: "USAGE",
          message: "还没初始化",
          hint: "先运行 leafpress init",
        },
      });
    }
    const doctor = runCli(["--home", home, "--json", "doctor"]);
    expect(doctor.status).toBe(0);
    expect(JSON.parse(doctor.stdout) as unknown).toMatchObject({ ok: true });
    expect(existsSync(join(home, "leafpress.db"))).toBe(false);
    expect(existsSync(join(home, "config.json"))).toBe(false);
    expect(readdirSync(home)).toEqual([]);
    // 起十来个子进程，体检还要问一次系统的计划任务（PowerShell 冷启动 1～2 秒），默认 5 秒不够
  }, 30_000);

  it("init → account → idea → convert → 接手 → step → waiting → feedback → run → done", () => {
    const init = JSON.parse(invoke(["init", "--json"], true)) as {
      ok: boolean;
      home: string;
      configFile: string;
      dbFile: string;
    };
    expect(init).toMatchObject({
      ok: true,
      home,
      configFile: join(home, "config.json"),
      dbFile: join(home, "leafpress.db"),
    });

    for (const [args, input, fragment] of [
      [["works", "--status", "invalid"], undefined, "作品状态不认识"],
      [
        ["work", "back", "w-1", "0", "--lease", "token"],
        undefined,
        "第几步必须是正整数",
      ],
      [
        ["ideas", "add", "--source", "invalid", "文本"],
        undefined,
        "来源不合法",
      ],
      [["work", "run", "w-1"], undefined, "--lease"],
      [
        ["ideas", "add", "--stdin"],
        '{"text":"not an array"}',
        "需要 JSON 数组",
      ],
    ] as const) {
      const invalid = runCli(["--home", home, "--json", ...args], input);
      expect(invalid.status).toBe(2);
      expect(invalid.stderr).toBe("");
      expect(invalid.stdout).toContain('"code": "USAGE"');
      expect(invalid.stdout).toContain(fragment);
    }

    const account = JSON.parse(
      invoke(
        [
          "account",
          "add",
          "--platform",
          "bilibili",
          "--name",
          "一叶之桐",
          "--intro",
          "写给开发者",
          "--json",
        ],
        true,
      ),
    ) as { account: { id: string } };
    const accountId = account.account.id;
    expect(accountId).toBe("bilibili-1");
    const secondAccount = JSON.parse(
      invoke(
        [
          "account",
          "add",
          "--platform",
          "blog",
          "--name",
          "博客账号",
          "--intro",
          "开发笔记",
          "--json",
        ],
        true,
      ),
    ) as { account: { id: string } };
    const secondAccountId = secondAccount.account.id;
    expect(secondAccountId).toMatch(/^blog-\d+$/u);

    const idea = JSON.parse(
      invoke(["ideas", "add", "测试灵感", "--json"], true),
    ) as { ideas: { id: string }[] };
    expect(idea.ideas[0]?.id).toBe("i-1");
    const converted = JSON.parse(
      invoke(
        ["convert", "i-1", "--to", `${accountId},${secondAccountId}`, "--json"],
        true,
      ),
    ) as { works: { id: string }[] };
    const workId = converted.works[0]?.id;
    expect(workId).toBeDefined();

    const started = JSON.parse(invoke(["work", "next", "--json"], true)) as {
      lease: { token: string };
      detail: { work: { id: string } };
    };
    expect(started.detail.work.id).toBe(workId);
    const folder = join(home, "tasks", workId as string);
    expect(existsSync(folder)).toBe(true);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "稿子.md"), "测试稿件\n", "utf8");
    const token = started.lease.token;
    invoke(
      ["work", "step", workId as string, "--lease", token, "--json"],
      true,
    );

    const waiting = JSON.parse(invoke(["works", "--json"], true)) as {
      works: { id: string; status: string }[];
    };
    expect(waiting.works.find((work) => work.id === workId)?.status).toBe(
      "waiting",
    );
    invoke(
      [
        "work",
        "feedback",
        workId as string,
        "发布了",
        "https://www.bilibili.com/video/BV1flow1",
        "页面检查完成",
      ],
      false,
    );

    const restarted = JSON.parse(invoke(["work", "next", "--json"], true)) as {
      lease: { token: string };
    };
    invoke(
      [
        "work",
        "run",
        workId as string,
        "--lease",
        restarted.lease.token,
        "--json",
      ],
      true,
    );
    const shown = JSON.parse(
      invoke(["work", "show", workId as string, "--json"], true),
    ) as { detail: { work: { status: string; url?: string } } };
    expect(shown.detail.work).toMatchObject({
      status: "done",
      url: "https://www.bilibili.com/video/BV1flow1",
    });
    expect(readFileSync(join(folder, "作品.md"), "utf8")).toContain("测试灵感");

    const leadingText = runCli([
      "--home",
      home,
      "--json",
      "ideas",
      "add",
      "--",
      "-3度的冬天",
    ]);
    expect(leadingText.status, leadingText.stderr).toBe(0);
    expect(JSON.parse(leadingText.stdout)).toMatchObject({
      ok: true,
      ideas: [{ text: "-3度的冬天" }],
    });

    const bomBatch = runCli(
      ["--home", home, "--json", "ideas", "add", "--stdin"],
      '\uFEFF[{"text":"BOM 批量灵感"}]',
    );
    expect(bomBatch.status, bomBatch.stderr).toBe(0);
    expect(JSON.parse(bomBatch.stdout)).toMatchObject({
      ok: true,
      ideas: [{ text: "BOM 批量灵感", source: "batch" }],
    });

    const newWorks = JSON.parse(
      invoke(
        [
          "work",
          "new",
          "--account",
          `${accountId},${secondAccountId}`,
          "--title",
          "双账号作品",
          "--json",
        ],
        true,
      ),
    ) as { works: { id: string }[] };
    expect(newWorks.works).toHaveLength(2);
    // 单独跑约 40 秒；整仓并发跑测试时子进程排队，留足余量
  }, 120_000);
});
