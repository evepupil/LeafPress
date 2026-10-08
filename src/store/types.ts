import type {
  AccountDayRecord,
  AccountStage,
  DayKey,
  Idea,
  IsoTime,
  PlatformId,
  PullRecord,
  WeeklyNote,
  Work,
  WorkSnapshotRecord,
} from "@leafpress/core";

/** 记录库里的账号。档案在文件里，配置项在 SettingsRepo，用例把它们拼成 Account */
export interface AccountRow {
  id: string;
  platform: PlatformId;
  name: string;
  handle?: string;
  url?: string;
  stage: AccountStage;
  since: DayKey;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export interface AccountsRepo {
  /** 按 created_at、再按 id */
  list(): AccountRow[];
  get(id: string): AccountRow | undefined;
  /** 编号已存在抛 STORE_FAILED */
  insert(row: AccountRow): void;
  /** 不存在抛 STORE_FAILED */
  update(row: AccountRow): void;
}

/** 账号配置项：只存普通配置的值和「过期」标记；密钥的值在凭证文件里 */
export interface SettingsRepo {
  /** 普通配置的值（只含值不为空的键） */
  values(accountId: string): Record<string, string>;
  /** 标了过期的键和原因 */
  expired(accountId: string): Record<string, string>;
  /** 写一个配置项：value 为 undefined 表示密钥项（值在凭证文件，这里只留一行、值为 NULL）；同时清掉过期标记 */
  set(
    accountId: string,
    key: string,
    value: string | undefined,
    at: IsoTime,
  ): void;
  /** 删掉这一行（值和过期标记一起） */
  clear(accountId: string, key: string): void;
  /** 标成过期；这一行不存在就新建一行（值为 NULL） */
  markExpired(
    accountId: string,
    key: string,
    reason: string,
    at: IsoTime,
  ): void;
}

export interface IdeasRepo {
  /** 全部灵感；workIds = 来源是这条灵感的作品编号，按作品 created_at、再按编号 */
  list(): Idea[];
  get(id: string): Idea | undefined;
  /** 忽略 idea.workIds */
  insert(idea: Idea): void;
  /** 忽略 idea.workIds；不存在抛 STORE_FAILED */
  update(idea: Idea): void;
  remove(id: string): void;
}

export interface WorksRepo {
  /** 全部作品，带记录和反馈历史（各自按写入先后） */
  list(): Work[];
  get(id: string): Work | undefined;
  /** 新建：写作品行，再写 work.log、work.feedbackHistory 的全部条目；lease 给了就写令牌 */
  insert(work: Work, lease?: { token: string }): void;
  /**
   * 整行更新作品的字段（不存在抛 STORE_FAILED）。
   * work.log、work.feedbackHistory 只追加记录库里还没有的部分：库里已有 n 条，就写第 n 条以后的。
   * 令牌：lease 为 undefined 不动；null 清掉；{ token } 换成它。work.lease 为 undefined 时，令牌和租约时间一律清掉。
   */
  update(work: Work, lease?: { token: string } | null): void;
  /** 当前租约的令牌；没有返回 undefined */
  leaseToken(id: string): string | undefined;
  /** 连带记录、反馈、快照一起删 */
  remove(id: string): void;
}

export interface SnapshotsRepo {
  /** day 在 [from, to] 的账号每天的数 */
  accountDays(from: DayKey, to: DayKey): AccountDayRecord[];
  /** day 在 [from, to] 的作品快照，外加每个作品在 from 之前的最后一条（当起点）；按作品、日期排 */
  workSnapshots(from: DayKey, to: DayKey): WorkSnapshotRecord[];
  /** 按（账号, 天）覆盖写 */
  putAccountDay(record: AccountDayRecord): void;
  /** 按（作品, 天）覆盖写；这天不早于作品现在的 totals_day（或作品还没有 totals）时，同时把作品的 totals、totals_day 改成这条 */
  putWorkSnapshot(record: WorkSnapshotRecord): void;
}

export interface PullsRepo {
  add(record: PullRecord): void;
  /** 每个账号最近的一条（按写入先后） */
  latest(): PullRecord[];
}

export interface NotesRepo {
  /** 按 week 新的在前 */
  list(): WeeklyNote[];
  /** 按 week 覆盖写；updatedAt 必须有 */
  save(note: WeeklyNote): void;
}

export interface StoreVersion {
  /** 任何写操作都加一 */
  seq: number;
  /** 数据快照写操作加一 */
  snapshotSeq: number;
}

export interface MetaRepo {
  version(): StoreVersion;
  /** 取下一个序号（从 1 开始），原子地加一 */
  nextSerial(name: "work" | "idea" | "account"): number;
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
  /** 升级前做的备份；没有升级或新建的库没有 */
  readonly backupPath?: string;
}

export interface OpenStoreOptions {
  /** 测试注入升级脚本，缺省用 MIGRATIONS */
  readonly migrations?: readonly Migration[];
}

export interface Store {
  readonly accounts: AccountsRepo;
  readonly settings: SettingsRepo;
  readonly ideas: IdeasRepo;
  readonly works: WorksRepo;
  readonly snapshots: SnapshotsRepo;
  readonly pulls: PullsRepo;
  readonly notes: NotesRepo;
  readonly meta: MetaRepo;
  readonly migration: MigrationReport;
  /** BEGIN IMMEDIATE 写事务；回调必须是同步函数；在事务里再调用就直接在外层事务里执行 */
  transaction<T>(fn: () => T): T;
  /** 用 VACUUM INTO 把整库一致地复制到 target（导出备份用） */
  backupTo(target: string): void;
  close(): void;
}
