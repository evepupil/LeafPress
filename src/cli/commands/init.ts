/** init 命令：首次写配置并初始化记录库。 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Command } from "commander";

import type { CliContext } from "../context.js";
import { writeConfigIfAbsent } from "../../config/load.js";
import { LeafPressError } from "../../shared/errors.js";
import { renderSuccessJson } from "../output.js";

export interface InitOptions {
  readonly blog?: string | undefined;
  readonly siteUrl?: string | undefined;
}

export interface InitResult {
  readonly created: boolean;
  readonly home: string;
  readonly configFile: string;
  readonly dbFile: string;
  readonly nextStep: string;
}

/** 返回目录是否存在且确为目录。 */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function invalidBlog(message: string, hint: string): never {
  throw new LeafPressError("USAGE", message, { hint });
}

function isNotDirectoryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOTDIR"
  );
}

/** 执行初始化；结果不包含任何凭证字段。 */
export async function executeInit(
  context: CliContext,
  options: InitOptions,
): Promise<InitResult> {
  if (existsSync(context.home) && !isDirectory(context.home)) {
    invalidBlog(
      `数据目录路径不是目录：${context.home}`,
      "请为 --home 指定一个目录路径。",
    );
  }
  try {
    mkdirSync(context.home, { recursive: true });
  } catch (error) {
    if (isNotDirectoryError(error)) {
      invalidBlog(
        `数据目录路径中的中间部分不是目录：${context.home}`,
        "请检查 --home 路径中的每一层是否都是目录。",
      );
    }
    throw error;
  }
  let created = false;

  if (!existsSync(context.paths.configFile)) {
    if (!options.blog) {
      invalidBlog(
        "首次初始化必须指定博客仓库路径。",
        "请使用 leafpress init --blog <博客仓库路径>。",
      );
    }

    const repoPath = resolve(options.blog);
    if (!isDirectory(repoPath)) {
      invalidBlog(
        `博客仓库目录不存在：${repoPath}`,
        "请检查 --blog 指定的路径。",
      );
    }
    if (!existsSync(join(repoPath, ".git"))) {
      invalidBlog(
        `博客路径不是 git 仓库：${repoPath}`,
        "请指定包含 .git 的仓库根目录。",
      );
    }
    const postsPath = join(repoPath, "content", "posts");
    if (!isDirectory(postsPath)) {
      invalidBlog(
        `博客仓库缺少 content/posts 目录：${postsPath}`,
        "请检查博客仓库是否包含 content/posts，或修正仓库路径。",
      );
    }

    if (options.siteUrl !== undefined && !isHttpUrl(options.siteUrl)) {
      invalidBlog(
        "博客网址不是合法的 HTTP(S) 网址。",
        "请为 --site-url 提供包含主机名的 http:// 或 https:// 网址。",
      );
    }

    const written = await writeConfigIfAbsent(context.home, {
      version: 1,
      materials: { projects: [] },
      zhihu: {},
      browser: {},
      blog: {
        repoPath,
        contentDir: "content/posts",
        remote: "origin",
        branch: "main",
        primaryLocaleDir: "zh",
        ...(options.siteUrl === undefined ? {} : { siteUrl: options.siteUrl }),
      },
    });
    created = written.created;
  }

  // 初始化和重复执行都确保数据库建好；doctor 则不会经过这个写入路径。
  context.getStore();
  return {
    created,
    home: context.paths.home,
    configFile: context.paths.configFile,
    dbFile: context.paths.dbFile,
    nextStep: "运行 leafpress doctor 检查环境",
  };
}

export function renderInit(result: InitResult): string {
  if (!result.created) {
    return `配置已存在，没有改动\n配置文件：${result.configFile}\n记录库：${result.dbFile}`;
  }
  return [
    "初始化完成",
    `数据目录：${result.home}`,
    `配置文件：${result.configFile}`,
    `记录库：${result.dbFile}`,
    result.nextStep,
  ].join("\n");
}

export function register(program: Command, getContext: () => CliContext): void {
  program
    .command("init")
    .description("初始化 LeafPress 数据目录")
    .option("--blog <路径>", "博客仓库路径")
    .option("--site-url <网址>", "博客网址")
    .action(async (options: InitOptions) => {
      const context = getContext();
      const result = await executeInit(context, options);
      process.stdout.write(
        `${context.globalOptions.json ? renderSuccessJson(result) : renderInit(result)}\n`,
      );
    });
}
