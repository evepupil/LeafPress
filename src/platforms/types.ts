/**
 * 平台接入：对一个平台的统一封装。
 *
 * 每个平台回答同样几个问题：支持哪些形态、每种形态有什么限制、用哪种发布方式；
 * 能当原稿来源的平台（比如博客）另外提供「原稿来源」。
 *
 * 分阶段补齐：
 * - M0：身份、能力、原稿来源
 * - M1 起：转换（版本稿件 → 平台成品包）、发布
 * - M5 起：拉数据
 * 加一个新平台 = 在 src/platforms/ 下加一个子目录，实现这个接口，再到登记表里登记。
 */
import type { PlatformId, PublishMode } from "../core/content.js";
import type { FormatConstraints, FormatId } from "../core/formats.js";

/** 平台对某种形态的支持 */
export interface PlatformCapability {
  readonly format: FormatId;
  readonly constraints: FormatConstraints;
  /** 可用的发布方式，第一个是默认 */
  readonly publishModes: readonly [PublishMode, ...PublishMode[]];
}

/** 原稿列表里的一条摘要 */
export interface SourceSummary {
  /** 在该平台内唯一的定位；博客为 "<语言目录>/<slug>"，比如 "zh/claude-code-rules" */
  readonly ref: string;
  readonly title: string;
  /** 元数据里写的语言，比如 "zh-CN"、"en" */
  readonly locale: string;
  /** 原稿自己的发布日期，规整成 YYYY-MM-DD */
  readonly publishedAt?: string;
  readonly updatedAt?: string;
  readonly tags: readonly string[];
  readonly draft: boolean;
  /** 中英文互为译文时相同 */
  readonly translationKey?: string;
  /** 文章最初写在哪：notion 表示由 Notion 同步进仓库，repo 表示直接写在仓库里 */
  readonly origin: "notion" | "repo";
  /** 原稿文件内容 sha256 */
  readonly contentHash: string;
  /** 原稿文件绝对路径 */
  readonly path: string;
}

/** 解析后的完整原稿 */
export interface ParsedSource extends SourceSummary {
  readonly description?: string;
  /** 去掉头部元数据后的 Markdown 正文，原样保留 */
  readonly body: string;
  /** 正文里引用的图片地址，按出现顺序，原样保留 */
  readonly images: readonly string[];
  /** 流程图（mermaid 代码块）的个数 */
  readonly mermaidBlockCount: number;
  /** 指向站内的链接（以 / 开头，或不带协议的相对路径），按出现顺序，原样保留 */
  readonly internalLinks: readonly string[];
  /** 原始头部元数据，供平台接入按需读取 */
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/** 列原稿时遇到的问题（比如元数据缺字段），记下来但不中断整个列表 */
export interface SourceIssue {
  readonly path: string;
  readonly message: string;
}

export interface SourceListing {
  readonly sources: readonly SourceSummary[];
  readonly issues: readonly SourceIssue[];
}

/**
 * 拉取结果：
 * - fast-forwarded：本地落后且工作区干净，已快进到远程
 * - up-to-date：已经是最新
 * - skipped-dirty：工作区有未提交改动，没动仓库
 * - skipped-ahead：本地有未推送的提交，没动仓库
 * - skipped-diverged：本地和远程分叉了，没动仓库
 * - failed：拉取失败（比如断网），没动仓库
 */
export type SyncAction =
  | "fast-forwarded"
  | "up-to-date"
  | "skipped-dirty"
  | "skipped-ahead"
  | "skipped-diverged"
  | "failed";

export interface SyncResult {
  readonly action: SyncAction;
  readonly branch: string;
  /** 拉取前本地比远程少几个提交 */
  readonly behindBefore: number;
  /** 拉取前本地比远程多几个提交 */
  readonly aheadBefore: number;
  /** 给人看的中文说明 */
  readonly message: string;
}

/** 能当原稿来源的平台实现它 */
export interface SourceProvider {
  /** 拉到最新：只有工作区干净、本地单纯落后时才快进，其他情况一律不动仓库，只报告 */
  sync(): Promise<SyncResult>;
  /** 列出全部原稿；单篇有问题记进 issues，不抛错 */
  list(): Promise<SourceListing>;
  /** 读一篇完整原稿；ref 不存在时抛 LeafPressError("SOURCE_NOT_FOUND") */
  read(ref: string): Promise<ParsedSource>;
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  /** 中文名，比如「知乎」 */
  readonly name: string;
  readonly capabilities: readonly PlatformCapability[];
  /** 只有能当原稿来源的平台才有 */
  readonly sources?: SourceProvider;
}

/** 一个发布目标：某平台的某种形态 */
export interface PublishTarget {
  readonly platform: PlatformId;
  readonly platformName: string;
  readonly format: FormatId;
  readonly capability: PlatformCapability;
}
