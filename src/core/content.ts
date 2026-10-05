/**
 * 内容模型：作品、原稿、资产、版本、发布记录。
 *
 * 一个作品 = 一个选题最后产出的全部内容：
 *   作品 ─┬─ 原稿（权威版本：博客文章，以后也可以是视频母版）
 *        ├─ 资产（图片、流程图、封面、卡片、视频、字幕、音频）
 *        └─ 版本（平台 + 形态 + 稿件）─── 发布记录（链接、平台编号、时间）
 *
 * 模型同时容纳图文和视频，平台和形态都不写死，加平台、加形态不需要改这里的结构。
 */
import type { FormatId } from "./formats.js";

/** 平台编号，比如 "blog"、"zhihu"。由平台登记表负责校验，内容模型不写死平台列表。 */
export type PlatformId = string;

/** ISO 8601 时间字符串（UTC），例如 2026-10-05T08:00:00.000Z */
export type IsoDateTime = string;

export interface Work {
  readonly id: string;
  title: string;
  readonly createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type SourceKind = "article" | "video-master";

/**
 * 原稿：作品的权威版本。
 * - 文章：platform = "blog"，ref = "<语言目录>/<slug>"，比如 "zh/claude-code-rules"
 * - 视频母版（以后）：platform = "local"，ref = 视频文件的绝对路径
 */
export interface Source {
  readonly id: string;
  readonly workId: string;
  readonly kind: SourceKind;
  readonly platform: PlatformId;
  readonly ref: string;
  title: string;
  locale?: string;
  /** 原稿文件内容的 sha256 十六进制串，用来判断原稿有没有改过 */
  contentHash: string;
  /** 原稿自己的发布日期，原样保留（博客里是 YYYY-MM-DD） */
  publishedAt?: string;
  readonly createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type AssetKind =
  "image" | "diagram" | "cover" | "card" | "video" | "subtitle" | "audio";

export interface Asset {
  readonly id: string;
  readonly workId: string;
  readonly kind: AssetKind;
  /** 本地文件绝对路径 */
  path: string;
  /** 文件内容 sha256，内容没变就不重复处理、不重复上传 */
  contentHash: string;
  mime?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  /** 由哪个资产生成（资产编号），比如压缩图来自原图 */
  derivedFrom?: string;
  readonly createdAt: IsoDateTime;
}

/**
 * 版本状态：
 *   draft ──► pending-confirm ──► published
 *     ▲            │
 *     └────────────┘ 作者驳回或改稿后退回草稿
 *   draft、pending-confirm ──► abandoned
 */
export type VariantStatus =
  "draft" | "pending-confirm" | "published" | "abandoned";

export interface Variant {
  readonly id: string;
  readonly workId: string;
  readonly sourceId: string;
  readonly platform: PlatformId;
  readonly format: FormatId;
  /**
   * 发布目标，用来防重复发布。同一原稿、同一平台、同一形态、同一目标只能发一次。
   * 长文没有目标，填空串；回答填问题编号，所以一篇原稿可以回答多个不同的问题。
   */
  readonly targetKey: string;
  status: VariantStatus;
  /** 版本稿件文件的绝对路径 */
  draftPath?: string;
  /** 形态相关的附加信息，由平台接入定义并校验，比如回答关联的问题标题和链接 */
  options: Record<string, unknown>;
  readonly createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * 发布方式：
 * - skill-handoff：交给其他 Claude Code skill（知乎官方发布 skill）
 * - manual：生成成品，作者手动发布后回填链接
 * - git：写进 git 仓库并提交（博客）
 * - external-cli：调用外部发布工具（以后的 B站 biliup）
 * - api：自己签名调平台接口
 * - browser：模拟浏览器操作，作者明确同意后才用
 */
export type PublishMode =
  "skill-handoff" | "manual" | "git" | "external-cli" | "api" | "browser";

/**
 * 发布记录的状态：
 * - pending：发布意图。调平台之前先登记，调完再改成下面两种之一；进程在中途崩溃时它会留下来，
 *   提醒「上次结果未知」，从而挡住自动重发
 * - published：拿到了平台链接（这个状态必须有 url）
 * - unverified：结果说不清（比如超时），等作者核实
 */
export type PublicationStatus = "pending" | "published" | "unverified";

export interface Publication {
  readonly id: string;
  readonly variantId: string;
  readonly platform: PlatformId;
  readonly format: FormatId;
  readonly mode: PublishMode;
  status: PublicationStatus;
  url?: string;
  /** 平台上的内容编号，比如知乎文章的 content_token */
  platformContentId?: string;
  readonly publishedAt: IsoDateTime;
  /** 发布工具返回的原始结果，去掉密钥后保存，便于排查 */
  raw?: Record<string, unknown>;
}
