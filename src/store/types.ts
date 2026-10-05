/**
 * 记录库对外的接口。SQLite 实现见同目录其他文件，规格见 docs/模块设计/记录库-SQLite存储.md。
 *
 * 读回的数据里，空值一律是「字段不存在」（undefined），不会出现 null。
 */
import type {
  IsoDateTime,
  PlatformId,
  Publication,
  PublicationStatus,
  PublishMode,
  Source,
  SourceKind,
  Variant,
  VariantStatus,
  Work,
} from "../core/content.js";
import type { FormatId } from "../core/formats.js";
import type { RunStore } from "../workflows/types.js";

export interface WorkRepo {
  create(input: { readonly title: string }): Work;
  get(id: string): Work | undefined;
}

export interface SourceUpsertInput {
  readonly platform: PlatformId;
  readonly kind: SourceKind;
  readonly ref: string;
  readonly title: string;
  readonly locale?: string;
  readonly contentHash: string;
  readonly publishedAt?: string;
}

export interface SourceUpsertResult {
  readonly source: Source;
  /** 这次是新建的（同时新建了作品） */
  readonly created: boolean;
  /** 已存在，且标题、语言、哈希、发布日期至少有一项变了 */
  readonly changed: boolean;
}

export interface SourceRepo {
  /** 按（平台, ref）找原稿；没有就新建作品和原稿；有就更新标题、语言、哈希、发布日期 */
  upsert(input: SourceUpsertInput): SourceUpsertResult;
  get(id: string): Source | undefined;
  getByRef(platform: PlatformId, ref: string): Source | undefined;
  /** 按 ref 升序 */
  list(platform?: PlatformId): Source[];
}

export interface VariantCreateInput {
  readonly sourceId: string;
  readonly platform: PlatformId;
  readonly format: FormatId;
  /** 缺省为空串 */
  readonly targetKey?: string;
  /** 缺省为 draft */
  readonly status?: VariantStatus;
  readonly draftPath?: string;
  /** 缺省为 {} */
  readonly options?: Record<string, unknown>;
}

export interface VariantPatch {
  readonly status?: VariantStatus;
  /** null 表示清空 */
  readonly draftPath?: string | null;
  readonly options?: Record<string, unknown>;
}

export interface VariantRepo {
  /** 作品编号取自原稿；原稿不存在时抛 LeafPressError("STORE_FAILED") */
  create(input: VariantCreateInput): Variant;
  get(id: string): Variant | undefined;
  /** 按创建时间升序 */
  listBySource(sourceId: string): Variant[];
  /** 版本不存在时抛 LeafPressError("STORE_FAILED") */
  update(id: string, patch: VariantPatch): Variant;
}

/** 作者手动发布后登记用 */
export interface PublicationRecordInput {
  readonly variantId: string;
  /** 平台上的链接，必填 */
  readonly url: string;
  readonly platformContentId?: string;
  /** 缺省为当前时间 */
  readonly publishedAt?: IsoDateTime;
  readonly raw?: Record<string, unknown>;
}

/** 体检用：只读查看记录库，不建目录、不建库、不升级 */
export interface StoreInspection {
  /** 库文件是否存在 */
  readonly exists: boolean;
  /** 库里的表结构版本；文件不存在时没有 */
  readonly version?: number;
  /** 当前代码认识的最新版本 */
  readonly expectedVersion: number;
}

/** 发布完成后的结果：拿到链接算已发布，结果说不清算待核实 */
export type PublicationResult =
  | {
      readonly status: "published";
      readonly url: string;
      readonly platformContentId?: string;
      /** 缺省为当前时间 */
      readonly publishedAt?: IsoDateTime;
      readonly raw?: Record<string, unknown>;
    }
  | {
      readonly status: "unverified";
      /** 为什么说不清，中文 */
      readonly reason: string;
      readonly raw?: Record<string, unknown>;
    };

/**
 * 发布记录。防重复发布的「目标」=（原稿, 平台, 形态, targetKey），平台和形态一律从版本上取，不信任调用方。
 * 一个目标上「占位」的记录是 published、pending、unverified 三种之一；有占位记录时不能再发。
 * 所有写方法都在 BEGIN IMMEDIATE 写事务里先查再写，两个进程同时操作同一目标时只有一个成功。
 */
export interface PublicationRepo {
  /**
   * 调平台之前登记发布意图（状态 pending）。查重：
   * - 目标上已有 published → 抛 ALREADY_PUBLISHED（message 写明平台、形态、已有链接）
   * - 目标上已有 pending 或 unverified → 抛 PUBLISH_IN_DOUBT（上次结果还没核实，不能自动再发）
   */
  begin(input: {
    readonly variantId: string;
    readonly mode: PublishMode;
  }): Publication;
  /** pending → published（必须带链接，同时把版本状态改成 published）或 unverified；记录不是 pending 抛 STORE_FAILED */
  complete(id: string, result: PublicationResult): Publication;
  /** 确定没有发出去（比如还没调平台就失败了）：删除这条 pending 记录；不是 pending 抛 STORE_FAILED */
  abort(id: string): void;
  /** 作者手动发布后直接登记为已发布（必须带链接，发布方式记为 manual），查重规则同 begin */
  recordManual(input: PublicationRecordInput): Publication;
  /** 作者核实发出去了：unverified → published（必须带链接，同时把版本状态改成 published）；不是 unverified 抛 STORE_FAILED */
  confirm(
    id: string,
    patch: { readonly url: string; readonly platformContentId?: string },
  ): Publication;
  /** 作者核实没发出去：删除这条 unverified 记录，之后可以重新发布；不是 unverified 抛 STORE_FAILED */
  discard(id: string): void;
  get(id: string): Publication | undefined;
  /** 按发布时间升序 */
  listByVariant(variantId: string): Publication[];
  /** 目标上的占位记录；有 published 时优先返回它 */
  findBlocking(
    sourceId: string,
    platform: PlatformId,
    format: FormatId,
    targetKey: string,
  ): Publication | undefined;
}

/** 发布状态总览的一行：一个版本，以及它的一条发布记录（没有发布记录时发布相关字段不存在） */
export interface PublicationOverviewRow {
  readonly sourceId: string;
  readonly platform: PlatformId;
  readonly format: FormatId;
  readonly targetKey: string;
  readonly variantId: string;
  readonly variantStatus: VariantStatus;
  readonly publicationId?: string;
  readonly publicationStatus?: PublicationStatus;
  readonly url?: string;
  readonly publishedAt?: IsoDateTime;
}

export interface Migration {
  /** 从 1 开始连续递增 */
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface MigrationReport {
  /** 打开前的表结构版本，新建的库为 0 */
  readonly from: number;
  readonly to: number;
  /** 升级前做的备份文件路径；没有升级或新建的库没有备份 */
  readonly backupPath?: string;
}

export interface Store {
  readonly works: WorkRepo;
  readonly sources: SourceRepo;
  readonly variants: VariantRepo;
  readonly publications: PublicationRepo;
  readonly runs: RunStore;
  /** 本次打开时的升级情况 */
  readonly migration: MigrationReport;
  /** 一组原稿的全部版本及发布记录 */
  publicationOverview(sourceIds: readonly string[]): PublicationOverviewRow[];
  /** 在一个写事务里执行；fn 抛错则整体回滚并原样抛出。不支持嵌套调用 */
  transaction<T>(fn: () => T): T;
  close(): void;
}

export interface OpenStoreOptions {
  /** 测试注入时间 */
  readonly now?: () => Date;
  /** 测试注入编号生成，缺省用 crypto.randomUUID */
  readonly newId?: () => string;
  /** 测试注入升级脚本，缺省用正式的升级脚本列表 */
  readonly migrations?: readonly Migration[];
}
