/**
 * 开发记录来源（readDevActivity）的测试：真 git、临时文件夹。
 *
 * 临时根下按需要搭仓库：git init、配好 user.name 和 user.email，
 * 用 --date 和 GIT_COMMITTER_DATE 做出指定日期的提交；跑完删掉临时文件夹。
 * git 一律走 src/shared/exec.ts 的真实实现。
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readDevActivity } from "../../src/ideas/devlog.js";
import { execCommand } from "../../src/shared/exec.js";
import type { ExecFn, ExecResult } from "../../src/shared/exec.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leafpress-devlog-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 在指定目录里跑 git（真实现），失败直接抛给测试 */
async function git(cwd: string, args: readonly string[]): Promise<ExecResult> {
  const result = await execCommand("git", args, {
    cwd,
    // 测试环境的 git 命令不该弹交互提示；窗口很短，不会超时
    timeoutMs: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
  return result;
}

/** 在 root 下建一个 git 仓库，返回项目路径 */
async function makeRepo(root: string, name: string): Promise<string> {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  const results = [
    await git(path, ["init"]),
    await git(path, ["config", "user.name", "测试"]),
    await git(path, ["config", "user.email", "test@example.com"]),
  ];
  for (const result of results) expect(result.exitCode).toBe(0);
  return path;
}

/**
 * 在仓库里做一条指定时刻（北京时间，YYYY-MM-DDTHH:mm:ss）的提交。
 * 作者日期用 --date，提交日期用 GIT_COMMITTER_DATE：git log --since 按提交日期筛，
 * 两个都指定，提交才稳定落在想要的时刻里。
 */
async function commitAt(
  path: string,
  message: string,
  stamp: string,
): Promise<void> {
  const result = await execCommand(
    "git",
    ["commit", "--allow-empty", `--date=${stamp}+08:00`, "-m", message],
    {
      cwd: path,
      timeoutMs: 15_000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        GIT_COMMITTER_DATE: `${stamp}+08:00`,
      },
    },
  );
  expect(result.exitCode).toBe(0);
}

/** 在仓库里做一条指定日期中午 12 点的提交 */
function commitOn(path: string, message: string, day: string): Promise<void> {
  return commitAt(path, message, `${day}T12:00:00`);
}

/** 在项目里写一份进度流水；content 默认按 UTF-8 写，带 BOM 时由调用方自己拼 */
async function writeLog(
  path: string,
  day: string,
  content: string,
  withBom = false,
): Promise<void> {
  const target = join(path, "docs", "进度", `${day}.md`);
  await mkdir(join(path, "docs", "进度"), { recursive: true });
  await writeFile(target, withBom ? `\uFEFF${content}` : content, "utf8");
}

/** 造一个假的工作树：根下放一个内容是 gitdir 指向的 .git 文件（不用真 git） */
async function makeWorktreeRepo(root: string, name: string): Promise<string> {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  await mkdir(join(root, `_bare-${name}`), { recursive: true });
  await writeFile(
    join(path, ".git"),
    `gitdir: ${join(root, `_bare-${name}`)}\n`,
    "utf8",
  );
  return path;
}

function input(
  roots: readonly string[],
  since: string,
): {
  roots: readonly string[];
  since: string;
  exec: ExecFn;
} {
  return { roots, since, exec: execCommand };
}

/** 大小写翻转：Windows 路径不区分大小写，翻转后还是同一个文件夹 */
function swapCase(path: string): string {
  return path
    .split("")
    .map((ch) =>
      ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase(),
    )
    .join("");
}

const TODAY = "2026-10-19";
const SINCE = "2026-10-13";

// 每条都真起 git 建仓库、做提交：整仓并行跑时 Windows 上起进程很慢，5 秒的缺省超时会偶发不够
describe("readDevActivity", { timeout: 60_000 }, () => {
  it("根下一层有 .git 文件夹和 .git 文件的都算项目，没 .git 的不算", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repoA = await makeRepo(root, "alpha"); // .git 是文件夹
    await commitOn(repoA, "alpha 提交", TODAY);
    // .git 是文件（工作树）：本身没提交，靠进度流水出现在结果里，证明它也被当项目
    const repoB = await makeWorktreeRepo(root, "beta");
    await writeLog(repoB, TODAY, "## 工作树项目\n");
    await mkdir(join(root, "not-git"), { recursive: true }); // 有内容但没 .git
    await writeFile(join(root, "plain.txt"), "x", "utf8");

    const activities = await readDevActivity(input([root], SINCE));
    expect(activities.map((a) => a.repo)).toEqual(["alpha", "beta"]);
  });

  it("根不存在时跳过，不抛错；存在的根照常读", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "only");
    await commitOn(repo, "提交", TODAY);

    const activities = await readDevActivity(
      input([join(dir, "nope-not-there"), root], SINCE),
    );
    expect(activities.map((a) => a.repo)).toEqual(["only"]);
    expect(activities[0]?.path).toBe(repo);
  });

  it("since 之前的提交不算；合并提交不算", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "hist");
    // 切到分线之前先记下主分支名（git init 的默认分支名图机器而异）
    const mainBranch = (await git(repo, ["branch", "--show-current"])).stdout;
    expect(mainBranch.trim()).not.toBe("");
    // 三个普通提交：一个在窗口外，两个在窗口内
    await commitOn(repo, "窗口外的提交", "2026-09-01");
    await commitOn(repo, "窗口内提交 1", SINCE);
    await commitOn(repo, "窗口内提交 2", TODAY);
    // 分线上再做一个窗口内的普通提交，回主分支 merge --no-ff：
    // 合并提交本身也钉在窗口内，但 --no-merges 会挡掉它；两边的普通提交都算
    expect((await git(repo, ["checkout", "-b", "feature"])).exitCode).toBe(0);
    await commitOn(repo, "分线提交", TODAY);
    expect((await git(repo, ["checkout", mainBranch.trim()])).exitCode).toBe(0);
    // 合并提交的时间固定在窗口内（GIT_COMMITTER_DATE），不能靠碰巧落在今天
    const merge = await execCommand(
      "git",
      [
        "merge",
        "--no-ff",
        "--no-edit",
        "-m",
        "Merge branch 'feature'",
        "feature",
      ],
      {
        cwd: repo,
        timeoutMs: 15_000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "never",
          GIT_COMMITTER_DATE: `${TODAY}T18:00:00+08:00`,
        },
      },
    );
    expect(merge.exitCode).toBe(0);

    const activities = await readDevActivity(input([root], SINCE));
    // 两边的普通提交都在，合并提交的说明不在
    expect(activities[0]?.commits).toEqual([
      "窗口内提交 2",
      "分线提交",
      "窗口内提交 1",
    ]);
    expect(activities[0]?.commits).not.toContain("Merge branch 'feature'");
  });

  it("北京时间零点的边界：当天 00:30 算，前一天 23:30 不算", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "edge");
    // 注意提交顺序：链顶（HEAD）得是窗口内最新的提交。
    // git 的 --since 拿 HEAD 的提交时间当遍历上界近似，链顶比窗口早时整条链被判空。
    await commitAt(repo, "前一天白天", "2026-10-11T10:00:00");
    await commitAt(repo, "前一天深夜", "2026-10-12T23:30:00");
    await commitAt(repo, "当天凌晨", `${SINCE}T00:30:00`);

    const activities = await readDevActivity(input([root], SINCE));
    expect(activities[0]?.commits).toEqual(["当天凌晨"]);
  });

  it("提交说明最多收 30 条", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "many");
    // 35 条提交一条一条起 git，并行跑别的测试时会慢，给足超时
    for (let i = 1; i <= 35; i += 1)
      await commitOn(repo, `提交 ${String(i).padStart(2, "0")}`, TODAY);

    const activities = await readDevActivity(input([root], SINCE));
    expect(activities[0]?.commits).toHaveLength(30);
    expect(activities[0]?.commits[0]).toBe("提交 35");
    expect(activities[0]?.commits[29]).toBe("提交 06");
  }, 30_000);

  it("进度流水按文件名日期筛、新的在前取 10 个，只读二级标题不读三级", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "logs");
    await commitOn(repo, "顺手一条提交", TODAY);
    // 窗口外和名字不对的文件都不算；窗口内 12 个，只取最新 10 个
    await writeLog(repo, "2026-09-30", "## 太早的\n");
    await writeLog(repo, "notes.txt", "## 名字不对\n");
    for (let i = 1; i <= 12; i += 1)
      await writeLog(
        repo,
        `2026-10-${String(i + 12).padStart(2, "0")}`,
        [
          "# 2026-10-13 进度流水",
          "",
          `## 一级目标 ${i}`,
          "",
          "正文一行",
          "",
          "### 三级小节",
          "",
          "##第二个没空格的不算",
          "",
          "##   两边多空格的标题   ",
        ].join("\n"),
      );

    const activities = await readDevActivity(input([root], SINCE));
    const logs = activities[0]?.logs ?? [];
    expect(logs).toHaveLength(10);
    // 新的在前：12 个里取 10-19 号那 10 天（13、14 号被挤掉）
    expect(logs.map((log) => log.file)).toEqual([
      "2026-10-24.md",
      "2026-10-23.md",
      "2026-10-22.md",
      "2026-10-21.md",
      "2026-10-20.md",
      "2026-10-19.md",
      "2026-10-18.md",
      "2026-10-17.md",
      "2026-10-16.md",
      "2026-10-15.md",
    ]);
    // 只读二级标题：# 和 ### 都不算，「##」后面没空格不算，去井号和首尾空白
    expect(logs[0]?.headings).toEqual(["一级目标 12", "两边多空格的标题"]);
  });

  it("只有进度流水没有提交的项目也返回", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "quiet");
    // 仓库里没有任何提交
    await writeLog(repo, TODAY, "## 静默开发\n");

    const activities = await readDevActivity(input([root], SINCE));
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      repo: "quiet",
      path: repo,
      commits: [],
    });
    expect(activities[0]?.logs).toEqual([
      { file: `${TODAY}.md`, headings: ["静默开发"] },
    ]);
  });

  it("git 失败（目录被删）当没有提交，进度流水照读，不挡别的项目", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    // 假的工作树：.git 指向一个已经不存在的目录，git log 一定失败
    const broken = await makeWorktreeRepo(root, "broken");
    await writeLog(broken, TODAY, "## 只有流水\n");
    const healthy = await makeRepo(root, "healthy");
    await commitOn(healthy, "正常提交", TODAY);

    const activities = await readDevActivity(input([root], SINCE));
    // broken 当没有提交，但进度流水照读，所以还在结果里
    expect(activities.map((a) => a.repo).sort()).toEqual(["broken", "healthy"]);
    const brokenActivity = activities.find((a) => a.repo === "broken");
    expect(brokenActivity?.commits).toEqual([]);
  });

  it("roots 里重复的根（大小写、末尾斜杠不同）只读一次，项目不重复返回", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "dup");
    await commitOn(repo, "唯一一次提交", TODAY);

    // 同一个根的几种写法：原样、末尾多斜杠、大小写不同，都是同一个文件夹
    const variants = [root, `${join(root, "/")}`, swapCase(root)];
    const activities = await readDevActivity(input(variants, SINCE));
    expect(activities).toHaveLength(1);
    expect(activities[0]?.repo).toBe("dup");
    expect(activities[0]?.commits).toEqual(["唯一一次提交"]);
  });

  it("进度流水文件名必须是真的日历日期：2026-02-31.md 不算", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "calendar");
    await writeLog(repo, "2026-02-28", "## 闰年正常末天\n");
    await writeLog(repo, "2024-02-29", "## 闰年闰一天\n");
    await writeLog(repo, "2026-02-30", "## 不存在的三十号\n");
    await writeLog(repo, "2026-02-31", "## 不存在的三十一号\n");
    await writeLog(repo, "2026-13-01", "## 不存在的十三月\n");
    await writeLog(repo, "2026-00-10", "## 不存在的零月\n");
    await writeLog(repo, "2026-10-00", "## 不存在的零号\n");

    // since 用一个早的日期，让形状合法的都过日期筛，只剩日历校验在挡
    const activities = await readDevActivity(input([root], "2020-01-01"));
    expect(activities[0]?.logs.map((log) => log.file)).toEqual([
      "2026-02-28.md",
      "2024-02-29.md",
    ]);
  });

  it("进度流水带 UTF-8 BOM 时第一行的二级标题也读得到", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const repo = await makeRepo(root, "bom");
    await writeLog(
      repo,
      TODAY,
      ["## 文件开头第一行的标题", "", "## 第二行的标题", ""].join("\n"),
      true,
    );

    const activities = await readDevActivity(input([root], SINCE));
    expect(activities[0]?.logs).toEqual([
      {
        file: `${TODAY}.md`,
        headings: ["文件开头第一行的标题", "第二行的标题"],
      },
    ]);
  });

  it("按提交条数从多到少排序，条数相同时按项目名", async () => {
    const root = join(dir, "code");
    await mkdir(root, { recursive: true });
    const zeta = await makeRepo(root, "zeta");
    await commitOn(zeta, "zeta 唯一提交", TODAY);
    const alpha = await makeRepo(root, "alpha");
    await commitOn(alpha, "alpha 提交 1", TODAY);
    await commitOn(alpha, "alpha 提交 2", TODAY);
    const middle = await makeRepo(root, "middle");
    await commitOn(middle, "middle 提交 1", TODAY);
    await commitOn(middle, "middle 提交 2", TODAY);
    // 窗口里没有提交也没流水的项目不返回（窗口外有提交也一样）
    const none = await makeRepo(root, "none");
    await commitOn(none, "很早以前的提交", "2026-08-01");

    const activities = await readDevActivity(input([root], SINCE));
    expect(activities.map((a) => a.repo)).toEqual(["alpha", "middle", "zeta"]);
    expect(activities.find((a) => a.repo === "none")).toBeUndefined();
  });
});
