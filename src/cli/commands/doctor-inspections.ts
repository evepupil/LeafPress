/** doctor 的只读检查器：将下层模块结果整理成统一检查项。 */
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

export async function safeCheck(
  id: string,
  label: string,
  run: () => DoctorCheck | Promise<DoctorCheck>,
  failureLevel: DoctorLevel = "warn",
  hint?: string,
): Promise<DoctorCheck> {
  try {
    return await run();
  } catch (error) {
    return doctorCheck(
      id,
      label,
      failureLevel,
      `检查失败：${describeDoctorError(error)}`,
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
