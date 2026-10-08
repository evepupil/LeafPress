/** doctor 命令：编排只读检查并渲染结果。 */
import type { Command } from "commander";

import type { CliContext } from "../context.js";
import { renderSuccessJson, renderTable } from "../output.js";
import {
  configFailure,
  doctorCheck,
  inspectBlog,
  safeCheck,
  type DoctorCheck,
  type DoctorDependencies,
  type DoctorLevel,
  type DoctorResult,
} from "./doctor-inspections.js";

export type { DoctorCheck, DoctorDependencies, DoctorLevel, DoctorResult };

function supportsNodeVersion(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(version);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor))
    return false;
  return major > 24 || (major === 24 && minor >= 2);
}

export async function executeDoctor(
  context: CliContext,
  dependencies: DoctorDependencies = {},
): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
  checks.push(
    await safeCheck(
      "node",
      "Node 版本",
      () =>
        supportsNodeVersion(nodeVersion)
          ? doctorCheck("node", "Node 版本", "ok", `Node.js ${nodeVersion}。`)
          : doctorCheck(
              "node",
              "Node 版本",
              "error",
              `当前 Node.js 版本为 ${nodeVersion}，需要 24.2.0 或更高版本。`,
              "升级到 Node.js 24.2.0 后重试。",
            ),
      "error",
    ),
  );

  let configAvailable = false;
  try {
    await context.getConfig();
    configAvailable = true;
    checks.push(
      doctorCheck(
        "config",
        "配置",
        "ok",
        `配置文件：${context.paths.configFile}`,
      ),
    );
  } catch (error) {
    checks.push(configFailure(error));
  }

  if (configAvailable) {
    checks.push(
      await safeCheck(
        "blog-repo",
        "博客仓库",
        () => inspectBlog(context, dependencies.exec, dependencies),
        "error",
        "检查配置里的 blog.repoPath 和 git 状态。",
      ),
    );
    checks.push(
      await safeCheck("blog-site-url", "博客网址", async () => {
        const config = await context.getConfig();
        return config.blog.siteUrl
          ? doctorCheck("blog-site-url", "博客网址", "ok", config.blog.siteUrl)
          : doctorCheck(
              "blog-site-url",
              "博客网址",
              "warn",
              "尚未配置博客网址；知乎版文末的原文链接需要它。",
              "在 config.json 的 blog.siteUrl 中填写博客网址。",
            );
      }),
    );
  }

  checks.push(
    await safeCheck(
      "browser",
      "浏览器",
      async () => {
        const config = configAvailable ? await context.getConfig() : undefined;
        const edgePath = context.findEdge(config?.browser.executablePath);
        return edgePath
          ? doctorCheck(
              "browser",
              "浏览器",
              "ok",
              `Microsoft Edge：${edgePath}`,
            )
          : doctorCheck(
              "browser",
              "浏览器",
              "warn",
              "没有找到 Microsoft Edge。",
              "安装 Microsoft Edge，或在 config.json 的 browser.executablePath 中指定路径。",
            );
      },
      "warn",
      "检查浏览器路径配置后重试。",
    ),
  );

  return { ok: checks.every((item) => item.level !== "error"), checks };
}

const STATUS = { ok: "✓", warn: "!", error: "✗" } as const;

export function renderDoctor(result: DoctorResult): string {
  const table = renderTable(
    ["检查项", "状态", "说明"],
    result.checks.map((item) => [item.label, STATUS[item.level], item.detail]),
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

export function register(program: Command, getContext: () => CliContext): void {
  program
    .command("doctor")
    .description("检查 LeafPress 运行环境")
    .action(async () => {
      const context = getContext();
      const result = await executeDoctor(context);
      context.setExitCode(result.ok ? 0 : 1);
      process.stdout.write(
        `${context.globalOptions.json ? renderSuccessJson(result) : renderDoctor(result)}\n`,
      );
    });
}
