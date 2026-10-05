/** doctor 命令：编排只读检查并渲染结果。 */
import { existsSync } from "node:fs";
import type { Command } from "commander";

import { checkZhihuDeveloper } from "../../config/zhihu-developer.js";
import { checkZhihuOpenApi } from "../../config/zhihu-openapi.js";
import type { CliContext } from "../context.js";
import { renderSuccessJson, renderTable } from "../output.js";
import {
  configFailure,
  errorCodeOrName,
  doctorCheck,
  inspectBlog,
  inspectDatabase,
  inspectPosts,
  safeCheck,
  skillPath,
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

/** 检查所有环境项；不打开或修改记录库。 */
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
      () => {
        return supportsNodeVersion(nodeVersion)
          ? doctorCheck("node", "Node 版本", "ok", `Node.js ${nodeVersion}。`)
          : doctorCheck(
              "node",
              "Node 版本",
              "error",
              `当前 Node.js 版本为 ${nodeVersion}，需要 24.2.0 或更高版本。`,
              "升级到 Node.js 24.2.0 后重试。",
            );
      },
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

  checks.push(
    await safeCheck(
      "store",
      "记录库",
      () => inspectDatabase(context.paths.dbFile, dependencies.inspect),
      "error",
      "请确认记录库文件是有效的 SQLite 数据库。",
    ),
  );

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
      await safeCheck(
        "blog-posts",
        "博客原稿",
        () => inspectPosts(context),
        "error",
        "检查博客原稿目录和权限。",
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
      "zhihu-openapi",
      "知乎发布凭证",
      async () => {
        const openApi = await checkZhihuOpenApi({
          env: context.env,
          homedir: context.homedir,
        });
        return doctorCheck(
          "zhihu-openapi",
          "知乎发布凭证",
          openApi.state === "ok" ? "ok" : "warn",
          openApi.state === "conflict"
            ? "环境变量和共享凭证文件中的凭证不一致，无法确定使用哪一套。"
            : openApi.detail,
          openApi.state === "ok" ? undefined : "按提示补齐或统一知乎发布凭证。",
        );
      },
      "warn",
      "检查共享凭证文件权限后重试。",
      (error) => `读取凭证时发生 ${errorCodeOrName(error)} 错误`,
    ),
  );

  checks.push(
    await safeCheck(
      "zhihu-publisher-skill",
      "知乎官方发布 skill",
      () => {
        const path = skillPath(context.homedir, "zhihu-publisher");
        return existsSync(path)
          ? doctorCheck(
              "zhihu-publisher-skill",
              "知乎官方发布 skill",
              "ok",
              `已安装：${path}`,
            )
          : doctorCheck(
              "zhihu-publisher-skill",
              "知乎官方发布 skill",
              "warn",
              `未找到：${path}`,
              "安装知乎官方发布 skill 后重试。",
            );
      },
      "warn",
      "检查用户目录的读取权限。",
    ),
  );

  checks.push(
    await safeCheck(
      "zhihu-uploader-skill",
      "知乎图片上传 skill",
      () => {
        const path = skillPath(context.homedir, "zhihu-mediacloud-uploader");
        return existsSync(path)
          ? doctorCheck(
              "zhihu-uploader-skill",
              "知乎图片上传 skill",
              "ok",
              `已安装：${path}`,
            )
          : doctorCheck(
              "zhihu-uploader-skill",
              "知乎图片上传 skill",
              "warn",
              `未找到：${path}`,
              "运行 npx skills add zhihu/zhihu-mediacloud-uploader.git -g 安装。",
            );
      },
      "warn",
      "检查用户目录的读取权限。",
    ),
  );

  if (configAvailable) {
    checks.push(
      await safeCheck(
        "zhihu-developer",
        "知乎数据接口密钥",
        async () => {
          const config = await context.getConfig();
          const developer = checkZhihuDeveloper({ env: context.env, config });
          return doctorCheck(
            "zhihu-developer",
            "知乎数据接口密钥",
            developer.state === "ok" ? "ok" : "warn",
            developer.detail,
            developer.state === "ok"
              ? undefined
              : "按提示配置知乎数据开放平台密钥。",
          );
        },
        "warn",
        "检查知乎数据接口密钥配置后重试。",
        (error) => `检查凭证时发生 ${errorCodeOrName(error)} 错误`,
      ),
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
