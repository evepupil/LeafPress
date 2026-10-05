/** doctor 的只读检查器：将下层模块结果整理成统一检查项。 */
import { join } from "node:path";

import { inspectStore } from "../../store/inspect.js";
import type { StoreInspection } from "../../store/types.js";
import { readRepoStatus } from "../../platforms/blog/repo-status.js";
import type { ExecFn } from "../../shared/exec.js";
import { execCommand } from "../../shared/exec.js";
import { LeafPressError } from "../../shared/errors.js";
import type { CliContext } from "../context.js";

export type DoctorLevel = "ok" | "warn" | "error";

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly level: DoctorLevel;
  readonly detail: string;
  readonly hint?: string;
}

export interface DoctorResult {
  readonly ok: boolean;
  readonly checks: readonly DoctorCheck[];
}

export interface DoctorDependencies {
  readonly nodeVersion?: string;
  readonly inspect?: (dbFile: string) => StoreInspection;
  readonly repoStatus?: typeof readRepoStatus;
  readonly exec?: ExecFn;
}

export function doctorCheck(
  id: string,
  label: string,
  level: DoctorLevel,
  detail: string,
  hint?: string,
): DoctorCheck {
  return { id, label, level, detail, ...(hint === undefined ? {} : { hint }) };
}

export function describeDoctorError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorCodeOrName(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return error instanceof Error ? error.name : "未知错误";
}

export async function safeCheck(
  id: string,
  label: string,
  run: () => DoctorCheck | Promise<DoctorCheck>,
  failureLevel: DoctorLevel = "warn",
  hint?: string,
  describeError: (error: unknown) => string = describeDoctorError,
): Promise<DoctorCheck> {
  try {
    return await run();
  } catch (error) {
    return doctorCheck(
      id,
      label,
      failureLevel,
      `检查失败：${describeError(error)}`,
      hint,
    );
  }
}

export function configFailure(error: unknown): DoctorCheck {
  if (error instanceof LeafPressError) {
    return doctorCheck("config", "配置", "error", error.message, error.hint);
  }
  return doctorCheck("config", "配置", "error", describeDoctorError(error));
}

export function inspectDatabase(
  dbFile: string,
  inspect: (path: string) => StoreInspection = inspectStore,
): DoctorCheck {
  try {
    const result = inspect(dbFile);
    if (!result.exists) {
      return doctorCheck(
        "store",
        "记录库",
        "warn",
        "记录库尚未创建。",
        "运行 leafpress init 创建记录库。",
      );
    }
    const version = result.version;
    if (version === undefined) {
      return doctorCheck(
        "store",
        "记录库",
        "error",
        "无法读取记录库版本。",
        "检查记录库文件是否有效。",
      );
    }
    if (version < result.expectedVersion) {
      return doctorCheck(
        "store",
        "记录库",
        "warn",
        `表结构版本为 ${version}，当前代码支持版本 ${result.expectedVersion}。`,
        "下次运行其他命令时会自动备份并升级记录库。",
      );
    }
    if (version > result.expectedVersion) {
      return doctorCheck(
        "store",
        "记录库",
        "error",
        `表结构版本为 ${version}，高于当前代码支持的版本 ${result.expectedVersion}。`,
        "请升级 LeafPress 后再访问记录库。",
      );
    }
    return doctorCheck("store", "记录库", "ok", `表结构版本 ${version}。`);
  } catch (error) {
    return doctorCheck(
      "store",
      "记录库",
      "error",
      `读取记录库失败：${describeDoctorError(error)}`,
      "请确认记录库文件是有效的 SQLite 数据库。",
    );
  }
}

export async function inspectBlog(
  context: CliContext,
  exec: ExecFn = execCommand,
  dependencies: DoctorDependencies = {},
): Promise<DoctorCheck> {
  const config = await context.getConfig();
  try {
    const status = await (dependencies.repoStatus ?? readRepoStatus)(
      exec,
      config.blog.repoPath,
      config.blog.remote,
      config.blog.branch,
    );
    if (!status.isRepo) {
      return doctorCheck(
        "blog-repo",
        "博客仓库",
        "error",
        "配置的路径不是 git 仓库。",
        "检查配置里的 blog.repoPath。",
      );
    }
    const branch = status.branch ?? "（未知分支）";
    if (status.dirty) {
      return doctorCheck(
        "blog-repo",
        "博客仓库",
        "warn",
        `当前分支 ${branch} 有已跟踪文件改动；本地多 ${status.ahead} 个提交、少 ${status.behind} 个。`,
        "检查并处理工作区改动后再同步。",
      );
    }
    const tracking = status.hasUpstream
      ? "远程跟踪分支已存在"
      : "尚无本地远程跟踪分支";
    return doctorCheck(
      "blog-repo",
      "博客仓库",
      "ok",
      `分支 ${branch}；${tracking}；本地多 ${status.ahead} 个提交、少 ${status.behind} 个。`,
      "需要拉取最新内容时运行 leafpress posts --sync。",
    );
  } catch (error) {
    return doctorCheck(
      "blog-repo",
      "博客仓库",
      "error",
      `读取博客仓库状态失败：${describeDoctorError(error)}`,
      "检查 git 是否可用，以及配置里的 blog.repoPath。",
    );
  }
}

export async function inspectPosts(context: CliContext): Promise<DoctorCheck> {
  try {
    const registry = await context.getRegistry();
    const sources = registry.get("blog").sources;
    if (sources === undefined) {
      throw new LeafPressError("INTERNAL", "博客平台没有原稿来源。");
    }
    const listing = await sources.list();
    const byLocale = new Map<string, number>();
    for (const source of listing.sources) {
      const localeDir = source.ref.split("/")[0] ?? "（未知目录）";
      byLocale.set(localeDir, (byLocale.get(localeDir) ?? 0) + 1);
    }
    const counts = [...byLocale]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locale, count]) => `${locale} ${count} 篇`);
    const issueCount = listing.issues.length;
    const detail = [
      counts.length === 0 ? "没有找到原稿" : `各语言目录：${counts.join("，")}`,
      ...(issueCount === 0 ? [] : [`有 ${issueCount} 篇原稿存在元数据问题`]),
    ].join("；");
    const hint =
      issueCount === 0
        ? undefined
        : listing.issues
            .map((issue) => `${issue.path}：${issue.message}`)
            .join("\n");
    return doctorCheck(
      "blog-posts",
      "博客原稿",
      issueCount === 0 ? "ok" : "warn",
      detail,
      hint,
    );
  } catch (error) {
    return doctorCheck(
      "blog-posts",
      "博客原稿",
      "error",
      `无法列出博客原稿：${describeDoctorError(error)}`,
      "检查 blog.repoPath 和 blog.contentDir，以及原稿目录权限。",
    );
  }
}

export function skillPath(homedir: string, skill: string): string {
  return join(homedir, ".claude", "skills", skill, "SKILL.md");
}
