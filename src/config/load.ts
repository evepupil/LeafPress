/**
 * 配置读写。
 *
 * loadConfig：文件缺失抛 CONFIG_MISSING；JSON 损坏或校验不过抛 CONFIG_INVALID，
 * message 逐条列出「字段路径：问题」，绝不出现字段的值（字段可能是密钥）。
 * 原始解析异常一律不挂到 cause 上：JSON.parse 的 SyntaxError.message 会带输入片段，
 * 配置以密钥开头时片段里就是密钥。开头带 UTF-8 BOM 的文件能正常读（解析前剥掉）。
 * writeConfigIfAbsent：先校验再落盘，校验不过拋 CONFIG_INVALID（同 loadConfig 的文案）；
 * 已存在不覆盖。提交方式是「写同目录临时文件，
 * 再用 link 原子建立目标」——目标已存在时 link 报 EEXIST，绝不覆盖；
 * 文件系统不支持硬链接时退回 wx 排他写入（同样不会覆盖）。
 */
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { $ZodIssue } from "zod/v4/core";
import { LeafPressError } from "../shared/errors.js";
import { ConfigSchema, type LeafPressConfig } from "./schema.js";

/** 把 zod issue 的 path 转成「blog.siteUrl」这样的字段路径文本 */
function pathText(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "配置对象";
  }
  return path.map((part) => String(part)).join(".");
}

/** 把 zod 的 issues 汇总成逐条「字段路径：问题」的中文文案 */
function describeIssues(issues: readonly $ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = pathText([...issue.path]);
    // unrecognized_keys 的 path 停在父对象上，键名在 issue.keys 里
    if (issue.code === "unrecognized_keys") {
      const keys = (issue as { keys?: unknown }).keys;
      const prefix = path === "配置对象" ? "" : `${path}.`;
      const names = Array.isArray(keys)
        ? keys.map((key) => `${prefix}${String(key)}`).join("、")
        : "";
      return `${path}：出现了不认识的字段（${names}），请检查是不是拼写错误`;
    }
    return `${path}：${issue.message}`;
  });
}

/** 单条问题一句话；多条时折成列表，逐条好读 */
function formatMessage(lines: readonly string[]): string {
  if (lines.length === 1) {
    return `配置文件有问题：${lines[0]}`;
  }
  return `配置文件有问题：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

/** 取 Node 文件系统错误的 error.code，不是文件系统错误时返回 undefined */
function codeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}

/** 去掉开头可能存在的 UTF-8 BOM：有些编辑器保存时会加上，不剥掉会被当成坏 JSON */
function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

/**
 * 读配置。文件不存在抛 CONFIG_MISSING（还没初始化）；
 * 不是合法 JSON 或校验不过抛 CONFIG_INVALID。返回值已带上默认值。
 */
export async function loadConfig(home: string): Promise<LeafPressConfig> {
  let raw: string;
  try {
    raw = await readFile(join(home, "config.json"), "utf8");
  } catch (error) {
    if (codeOf(error) === "ENOENT") {
      throw new LeafPressError(
        "CONFIG_MISSING",
        `目录 ${home} 下还没有 config.json。`,
        { hint: "先运行 leafpress init" },
      );
    }
    throw error;
  }

  let data: unknown;
  try {
    data = JSON.parse(stripBom(raw));
  } catch {
    // 故意不挂 cause：SyntaxError.message 会带输入片段，可能正是密钥
    throw new LeafPressError(
      "CONFIG_INVALID",
      "config.json 不是合法的 JSON。",
      {
        hint: "用编辑器检查 config.json 的语法，或删掉后重新运行 leafpress init。",
      },
    );
  }

  const parsed = ConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new LeafPressError(
      "CONFIG_INVALID",
      formatMessage(describeIssues(parsed.error.issues)),
      { hint: "修正 config.json 里列出的字段后重试。" },
    );
  }
  return parsed.data;
}

export interface WriteConfigResult {
  /** 是否真的写了文件；false 表示文件已存在、原样未动 */
  created: boolean;
  /** 配置文件的路径 */
  path: string;
}

/** 这些错误码表示文件系统不支持硬链接，退回排他写入；EPERM 可能是真实的权限或策略拒绝，直接抛出不退 */
const LINK_UNSUPPORTED = new Set(["ENOSYS", "EOPNOTSUPP", "ENOTSUP", "EXDEV"]);

/**
 * 首次写配置：目录不存在就建；文件已存在则完全不动（保护用户手改过的配置）。
 * 提交是原子的：临时文件写完后用 link 建立目标，目标已存在立即报 EEXIST，
 * 不存在「检查之后被人抢先写入」的竞态窗口。
 */
export async function writeConfigIfAbsent(
  home: string,
  config: LeafPressConfig,
): Promise<WriteConfigResult> {
  // 校验不过拋 CONFIG_INVALID 而不是 zod 原始异常：命令行才能显示
  // 「字段路径：问题」而不是「内部错误」加一段 JSON；文案不含字段值
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new LeafPressError(
      "CONFIG_INVALID",
      formatMessage(describeIssues(parsed.error.issues)),
      { hint: "修正配置里列出的字段后重试。" },
    );
  }
  const target = join(home, "config.json");
  const content = `${JSON.stringify(parsed.data, null, 2)}\n`;

  await mkdir(home, { recursive: true });
  // 临时文件带上进程号和随机串，避免并发初始化时互踩
  const temp = join(
    home,
    `.config.json.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  try {
    await writeFile(temp, content, "utf8");
    try {
      // 原子提交：link 不覆盖已存在的目标，存在即 EEXIST
      await link(temp, target);
      return { created: true, path: target };
    } catch (error) {
      if (codeOf(error) === "EEXIST") {
        return { created: false, path: target };
      }
      if (!LINK_UNSUPPORTED.has(codeOf(error) ?? "")) {
        throw error;
      }
      // 退路：排他写入（wx）同样保证「已存在就不动」
      try {
        await writeFile(target, content, { flag: "wx" });
        return { created: true, path: target };
      } catch (writeError) {
        if (codeOf(writeError) === "EEXIST") {
          // 目标是别人先建好的：不动它，也不删
          return { created: false, path: target };
        }
        // wx 能打开说明目标是本次排他创建的；写到一半失败会留下半截 config.json，
        // 还会让后续调用误判「已存在」，所以删掉这个残片再抛错
        await rm(target, { force: true });
        throw writeError;
      }
    }
  } finally {
    // 无论哪条路，临时文件都清掉
    await rm(temp, { force: true });
  }
}
