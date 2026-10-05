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

export interface PublicationRecordInput {
  readonly variantId: string;
  readonly mode: PublishMode;
  readonly status: PublicationStatus;
  readonly url?: string;
  readonly platformContentId?: string;
  /** 缺省为当前时间 */
  readonly publishedAt?: IsoDateTime;
  readonly raw?: Record<string, unknown>;
}

export interface PublicationRepo {
  /**
   * 登记一次发布（在一个写事务里完成）：
   * - status 为 published 时，若同一（原稿, 平台, 形态, 目标）已有 published 记录，
   *   抛 LeafPressError("ALREADY_PUBLISHED")，什么都不写；
   * - 写入成功且 status 为 published 时，把版本状态改成 published。
   */
  record(input: PublicationRecordInput): Publication;
  /** 按发布时间升序 */
  listByVariant(variantId: string): Publication[];
  findPublished(
    sourceId: string,
    platform: PlatformId,
    format: FormatId,
    targetKey: string,
  ): Publication | undefined;
  /**
   * 待核实 → 已发布（作者核实后），可补链接和平台编号。
   * 记录不是 unverified 时抛 STORE_FAILED；会造成重复发布时抛 ALREADY_PUBLISHED。
   */
  confirm(
    id: string,
    patch?: { readonly url?: string; readonly platformContentId?: string },
  ): Publication;
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
