import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, statSync, unlinkSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliContext } from "../context.js";
import { renderTable } from "../output.js";
import {
  configFailure,
  doctorCheck,
  safeCheck,
  type DoctorCheck,
  type DoctorDependencies,
  type DoctorLevel,
  type DoctorResult,
} from "./doctor-inspections.js";
import { emitSuccess } from "./shared.js";

export type { DoctorCheck, DoctorDependencies, DoctorLevel, DoctorResult };

function supportsNodeVersion(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(version);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (
    Number.isSafeInteger(major) &&
    Number.isSafeInteger(minor) &&
    (major > 24 || (major === 24 && minor >= 2))
  );
}

function defaultRepoRoot(): string {
  return resolve(fileURLToPath(new URL("../../../", import.meta.url)));
}

function checkNode(version: string): DoctorCheck {
  return supportsNodeVersion(version)
    ? doctorCheck("node", "Node 版本", "ok", `Node.js ${version}。`)
    : doctorCheck(
        "node",
        "Node 版本",
        "error",
        `当前 Node.js 版本为 ${version}，需要 24.2.0 或更高版本。`,
        "升级到 Node.js 24.2.0 后重试。",
      );
}

async function checkConfig(context: CliContext): Promise<DoctorCheck> {
  try {
    const { inspectConfig } = await import("../../config/load.js");
    const state = inspectConfig(context.home);
    if (!state.exists)
      return doctorCheck("config", "配置", "ok", "用默认配置。");
    await context.getConfig();
    if (state.version === 1) {
      return doctorCheck(
        "config",
        "配置",
        "warn",
        "配置文件是第 1 版。",
        "运行 leafpress init 升级配置。",
      );
    }
    return doctorCheck(
      "config",
      "配置",
      "ok",
      `配置文件：${context.paths.configFile}`,
    );
  } catch (error) {
    return configFailure(error);
  }
}

async function checkStore(context: CliContext): Promise<DoctorCheck> {
  try {
    const [{ inspectStore }, { MIGRATIONS }] = await Promise.all([
      import("../../store/inspect.js"),
      import("../../store/migrations.js"),
    ]);
    const inspection = inspectStore(context.paths.dbFile, MIGRATIONS.length);
    if (!inspection.exists)
      return doctorCheck(
        "store",
        "记录库",
        "warn",
        "记录库还不存在。",
        "运行 leafpress init 创建记录库。",
      );
    const version = inspection.version;
    if (version === undefined)
      return doctorCheck("store", "记录库", "error", "无法读取记录库版本。");
    if (version < inspection.expectedVersion) {
      return doctorCheck(
        "store",
        "记录库",
        "warn",
        `当前第 ${version} 版，需要第 ${inspection.expectedVersion} 版。`,
        "下次运行会自动备份并升级。",
      );
    }
    if (version > inspection.expectedVersion) {
      return doctorCheck(
        "store",
        "记录库",
        "error",
        `当前第 ${version} 版，高于支持的第 ${inspection.expectedVersion} 版。`,
        "请使用兼容此记录库版本的 LeafPress。",
      );
    }
    return doctorCheck("store", "记录库", "ok", `记录库第 ${version} 版。`);
  } catch (error) {
    return safeCheck(
      "store",
      "记录库",
      () => {
        throw error;
      },
      "error",
      "请确认记录库文件有效且可读。",
    );
  }
}

function canWriteDirectory(directory: string): boolean {
  const probe = join(directory, `.leafpress-doctor-${randomUUID()}`);
  let descriptor: number | undefined;
  let created = false;
  let writable = false;
  try {
    descriptor = openSync(probe, "wx", 0o600);
    created = true;
    closeSync(descriptor);
    descriptor = undefined;
    writable = true;
  } catch {
    writable = false;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        writable = false;
      }
    }
    if (created) {
      try {
        unlinkSync(probe);
      } catch {
        writable = false;
      }
    }
  }
  return writable;
}

function checkHome(
  context: CliContext,
  dependencies: DoctorDependencies,
): DoctorCheck {
  if (!existsSync(context.home))
    return doctorCheck(
      "home",
      "数据目录",
      "warn",
      "数据目录还不存在。",
      "运行 leafpress init 创建数据目录。",
    );
  if (!statSync(context.home).isDirectory())
    return doctorCheck(
      "home",
      "数据目录",
      "error",
      "数据目录路径不是目录。",
      "请检查 --home 指定的路径。",
    );
  if (!(dependencies.canWriteDirectory ?? canWriteDirectory)(context.home))
    return doctorCheck(
      "home",
      "数据目录",
      "error",
      `数据目录不可写：${context.home}`,
      "检查这个目录的权限。",
    );
  return doctorCheck("home", "数据目录", "ok", `可写：${context.home}`);
}

function checkWeb(root: string): DoctorCheck {
  const page = join(root, "web", "out", "index.html");
  return existsSync(page)
    ? doctorCheck("web", "网页", "ok", `已构建：${page}`)
    : doctorCheck(
        "web",
        "网页",
        "warn",
        "网页还没构建。",
        "在仓库里运行 pnpm --filter leafpress-web build。",
      );
}

function checkSkill(context: CliContext): DoctorCheck {
  const file = join(
    context.homedir || osHomedir(),
    ".claude",
    "skills",
    "leafpress",
    "SKILL.md",
  );
  return existsSync(file)
    ? doctorCheck("skill", "LeafPress skill", "ok", `已安装：${file}`)
    : doctorCheck(
        "skill",
        "LeafPress skill",
        "warn",
        "LeafPress skill 还没安装。",
        "运行 leafpress skill install 安装。",
      );
}

async function checkBrowser(
  context: CliContext,
  dependencies: DoctorDependencies,
): Promise<DoctorCheck> {
  try {
    const config = await context.getConfig().catch(() => undefined);
    const configuredPath = config?.browser.executablePath;
    const edge = dependencies.edgeLocator
      ? dependencies.edgeLocator(configuredPath)
      : (await import("../../assets/browser.js")).locateEdge({
          configuredPath,
          env: context.env,
          platform: context.platform,
        });
    return edge
      ? doctorCheck("browser", "浏览器", "ok", `Microsoft Edge：${edge}`)
      : doctorCheck(
          "browser",
          "浏览器",
          "warn",
          "没有找到 Microsoft Edge。",
          "安装 Microsoft Edge，或在 config.json 的 browser.executablePath 中指定路径。",
        );
  } catch (error) {
    return safeCheck(
      "browser",
      "浏览器",
      () => {
        throw error;
      },
      "warn",
      "检查浏览器路径配置后重试。",
    );
  }
}

export async function executeDoctor(
  context: CliContext,
  dependencies: DoctorDependencies = {},
): Promise<DoctorResult> {
  const root = dependencies.repoRoot ?? defaultRepoRoot();
  const checks = await Promise.all([
    safeCheck(
      "node",
      "Node 版本",
      () => checkNode(dependencies.nodeVersion ?? process.versions.node),
      "error",
    ),
    checkConfig(context),
    checkStore(context),
    safeCheck(
      "home",
      "数据目录",
      () => checkHome(context, dependencies),
      "error",
      "检查数据目录权限后重试。",
    ),
    safeCheck(
      "web",
      "网页",
      () => checkWeb(root),
      "warn",
      "请在仓库里构建网页。",
    ),
    safeCheck(
      "skill",
      "LeafPress skill",
      () => checkSkill(context),
      "warn",
      "运行 leafpress skill install 安装。",
    ),
    checkBrowser(context, dependencies),
  ]);
  return { ok: checks.every((item) => item.level !== "error"), checks };
}

const LEVEL_LABEL: Record<DoctorLevel, string> = {
  ok: "正常",
  warn: "注意",
  error: "错误",
};

export function renderDoctor(result: DoctorResult): string {
  const table = renderTable(
    ["检查项", "状态", "说明"],
    result.checks.map((item) => [
      item.label,
      LEVEL_LABEL[item.level],
      item.detail,
    ]),
  );
  const hints = result.checks
    .filter((item) => item.hint !== undefined)
    .map((item) => `- ${item.label}：${item.hint}`);
  const needsWork = result.checks.filter((item) => item.level !== "ok").length;
  return [
    table,
    ...(hints.length === 0 ? [] : [hints.join("\n")]),
    needsWork === 0 ? "全部正常" : `有 ${needsWork} 项需要处理`,
  ].join("\n\n");
}

export async function run(context: CliContext): Promise<void> {
  const result = await executeDoctor(context);
  context.setExitCode(result.ok ? 0 : 1);
  emitSuccess(context, result, renderDoctor(result));
}
