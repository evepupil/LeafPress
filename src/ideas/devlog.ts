/**
 * 开发记录来源：本机 git 仓库的最近提交和进度流水（见 docs/模块设计/灵感-跑灵感.md「开发记录」）。
 *
 * 这里只做「读」：跑 git log、读 <项目>/docs/进度/ 下的 markdown 文件，不改项目里的任何东西。
 * git 命令用注入进来的 exec 跑，测试时可以换成假实现。
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { readProgressLogs } from "./progress-logs.js";
import type { DevActivity, DevActivityInput } from "./types.js";

/** 单个 git 命令的超时：15 秒 */
export const GIT_TIMEOUT_MS = 15_000;
/** 提交说明最多收 30 条 */
const MAX_COMMITS = 30;

/**
 * 一个根文件夹下面一层里是项目的那些：有 .git 的文件夹才算
 * （.git 是文件夹还是文件都行，工作树的 .git 是文件）。
 * 根不存在或读不了就跳过，别的根照常。
 */
function listRepos(root: string): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const repos: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    if (hasDotGit(path)) repos.push(path);
  }
  return repos;
}

/** 项目判断：根下有 .git 这个名字（statSync 对文件和文件夹都成功；损坏的链接当没有） */
function hasDotGit(path: string): boolean {
  try {
    statSync(join(path, ".git"));
    return true;
  } catch {
    return false;
  }
}

/**
 * 路径的规范化键：去掉末尾斜杠、反斜杠换成 /、转小写。
 * Windows 路径不区分大小写，`C:\code`、`c:/code/` 是同一个文件夹，
 * 拿原样字符串去重会把同一个项目读两遍。
 */
function pathKey(path: string): string {
  return path
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

/**
 * 读一个项目的提交说明：git log 按窗口和 --no-merges 过滤，一行一条，新的在前。
 * 失败（非零退出码、超时、命令起不来）返回 null，调用方当「没有提交」，进度流水照读。
 */
async function readCommits(
  exec: DevActivityInput["exec"],
  path: string,
  since: string,
): Promise<string[]> {
  let stdout: string | null;
  try {
    const result = await exec(
      "git",
      [
        "log",
        `--since=${since}T00:00:00+08:00`,
        "--no-merges",
        "--pretty=format:%s",
        `-n${MAX_COMMITS}`,
      ],
      {
        cwd: path,
        timeoutMs: GIT_TIMEOUT_MS,
        // 无人值守的定时任务里没人答交互提示，先禁掉，免得干等到超时
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "never",
        },
      },
    );
    if (result.exitCode !== 0 || result.timedOut) return [];
    stdout = result.stdout;
  } catch {
    // 目录被删、git 没装这类环境问题都当「没有提交」，不挡别的项目
    return [];
  }
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, MAX_COMMITS);
}

/**
 * 读各根文件夹下项目的开发记录。每个项目独立处理：git 失败的项目当没有提交、
 * 进度流水照读，不影响别的项目。有提交或有进度流水的项目才返回。
 */
export async function readDevActivity(
  input: DevActivityInput,
): Promise<DevActivity[]> {
  const activities: DevActivity[] = [];
  // 同一个根可能写了多种写法（大小写、末尾斜杠不同）：先按规范化键去重，
  // 免得同一个项目被读两遍、结果里出现两份；项目路径再兜一层去重
  const seenRoots = new Set<string>();
  const seenProjects = new Set<string>();
  for (const root of input.roots) {
    const rootKey = pathKey(root);
    if (seenRoots.has(rootKey)) continue;
    seenRoots.add(rootKey);
    for (const path of listRepos(root)) {
      const projectKey = pathKey(path);
      if (seenProjects.has(projectKey)) continue;
      seenProjects.add(projectKey);
      const commits = await readCommits(input.exec, path, input.since);
      const logs = readProgressLogs(path, input.since);
      if (commits.length === 0 && logs.length === 0) continue;
      activities.push({
        repo: basenameOf(path),
        path,
        commits,
        logs,
      });
    }
  }
  // 提交条数从多到少，再按项目名
  activities.sort(
    (a, b) =>
      b.commits.length - a.commits.length || a.repo.localeCompare(b.repo),
  );
  return activities;
}

/** 项目文件夹名：路径末段的文件夹名（Windows 上分隔符两种写法都可能出现） */
function basenameOf(path: string): string {
  const segments = path.split(/[\\/]+/).filter((segment) => segment !== "");
  return segments[segments.length - 1] ?? path;
}
