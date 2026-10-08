# 记录库 · SQLite 存储

> 模块定位：LeafPress 全部业务数据的落盘与查询：账号、配置项、灵感、作品（含记录、反馈、租约令牌）、数据快照、拉取记录、复盘笔记、变更序号 · 对应代码：`src/store/` · 所属里程碑：[M0 地基](../roadmap.md#m0-地基)（打开与升级）、[M1 底座](../roadmap.md#m1-底座)（新模型） · 状态：已完成（M1 新模型） · 最近更新：2026-10-09

## 职责与边界

- 管：数据库文件的打开、表结构的建立与升级（升级前备份）、各张表的读写、事务、变更序号、编号序号、体检用的只读查看。
- 不管：业务判断（状态能不能这样变、拉数据该不该跳过），这些在共享规则和用例里；账号档案和任务文件夹（文件，在 `src/files/`）；密钥（凭证文件，在 `src/config/`）。
- 命令行（agent）和本机服务（网页）两个进程会同时读写同一个库：写操作一律在 `BEGIN IMMEDIATE` 事务里，读写不互相卡（WAL）。

## 结构与数据流

对外接口定死在 `src/store/types.ts`（内容见下面「接口」，照抄，不得改）。

| 文件 | 内容 |
|---|---|
| `open.ts` | `openStore(dbFile, options?)`：打开库、设参数、执行升级、组装各 Repo |
| `migrations.ts` | `MIGRATIONS`（第 1 版 = 第一阶段的旧表，原样保留；第 2 版 = 删旧表、建新表）、`migrate(...)` 升级逻辑 |
| `sql.ts` | 事务、JSON 列、空值转换等公共件（第一阶段已有，沿用） |
| `inspect.ts` | 体检用的只读查看（第一阶段已有，沿用；预期版本由调用方传 `MIGRATIONS.length`） |
| `meta.ts`、`accounts.ts`、`settings.ts`、`ideas.ts`、`works.ts`、`works-mapping.ts`、`snapshots.ts`、`pulls.ts`、`notes.ts` | 各 Repo 的实现，一个文件一个工厂函数 |

### 打开与升级（沿用第一阶段）

- 第一阶段的 `open.ts`、`migrations.ts` 在 M1 地基时删掉了，**从 git 历史恢复**（提交 `a7c517c` 里的 `src/store/open.ts`、`src/store/migrations.ts`），升级的做法一字不改：先设 `busy_timeout = 5000` 再切 WAL（遇忙重试）、`foreign_keys = ON`；有待升级且库原来就有数据时，事务外用 `VACUUM INTO` 备份到 `<库文件所在目录>/backups/<库文件名>.bak-v<版本>-<时间到毫秒>-<进程号>`（M1 起放进 backups，和架构设计一致；目录不存在先建）；`BEGIN IMMEDIATE` 后重读 `user_version`，别的进程已经升完就跳过，并删掉自己刚做的备份（它不代表这次升级前的状态），报告的 from 用重读的版本、不带备份路径；**所有待执行的脚本连同 `user_version` 放在同一个事务里一次执行完**（M1 改：别的进程看不到中间版本，两个进程同时首次建库、同时升级时不会给空库或已升完的库做备份）；新建的库不做备份；版本号必须从 1 连续；库的版本比代码高时报 `MIGRATION_FAILED`。
- 升级脚本的形状沿用：`{ version: number; name: string; sql: string }`。

### 表结构（升级脚本第 2 版）

第 2 版先删掉第一阶段的七张表（`run_steps`、`runs`、`publications`、`variants`、`assets`、`sources`、`works`，按这个顺序 `DROP TABLE IF EXISTS`），再建：

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO meta (key, value) VALUES
  ('seq', 0), ('snapshot_seq', 0), ('serial_work', 0), ('serial_idea', 0), ('serial_account', 0);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  url TEXT,
  stage TEXT NOT NULL,
  since TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE account_settings (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  expired_reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, key)
);

CREATE TABLE ideas (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  source_detail TEXT,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  ord INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL,
  source_id TEXT,
  workflow_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  ask TEXT,
  feedback TEXT,
  ord INTEGER NOT NULL,
  url TEXT,
  published_at TEXT,
  totals TEXT,
  totals_day TEXT,
  question TEXT,
  local_path TEXT,
  source_ref TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  lease_token TEXT,
  lease_since TEXT,
  lease_expires_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_works_status ON works (status, ord);
CREATE INDEX idx_works_source ON works (source_kind, source_id);

CREATE TABLE work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX idx_work_logs ON work_logs (work_id, id);

CREATE TABLE work_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  step INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX idx_work_feedback ON work_feedback (work_id, id);

CREATE TABLE account_days (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  followers INTEGER,
  reads INTEGER,
  interactions INTEGER,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE work_snapshots (
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  totals TEXT NOT NULL,
  PRIMARY KEY (work_id, day)
);

CREATE TABLE pulls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  fix_hint TEXT,
  note TEXT
);
CREATE INDEX idx_pulls ON pulls (account_id, id);

CREATE TABLE weekly_notes (
  week TEXT PRIMARY KEY,
  wins TEXT NOT NULL DEFAULT '',
  improve TEXT NOT NULL DEFAULT '',
  next TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
```

列和类型的对应：

- `works.source_kind` / `source_id` ↔ `Work.source`（idea 带 ideaId、work 带 workId、import 和 none 不带）。
- `works.totals`、`work_snapshots.totals`、`works.tags` 存 JSON 文本；`ord` ↔ `order`。
- `works.lease_since`、`lease_expires_at` ↔ `Work.lease`（两个都有值才有 lease）；`lease_token` 不进 `Work`，只经 `leaseToken()` 读。
- 读回时 SQL 的 NULL 一律变成「字段不存在」（沿用第一阶段的约定）；`Work.log`、`feedbackHistory`、`tags` 没有内容时是空数组。

### 接口（`src/store/types.ts`，照抄）

```ts
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
  set(accountId: string, key: string, value: string | undefined, at: IsoTime): void;
  /** 删掉这一行（值和过期标记一起） */
  clear(accountId: string, key: string): void;
  /** 标成过期；这一行不存在就新建一行（值为 NULL） */
  markExpired(accountId: string, key: string, reason: string, at: IsoTime): void;
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
```

### 规则

- **变更序号**：任何 Repo 的写方法（insert、update、remove、set、clear、markExpired、put*、add、save）都在同一个事务里把 `meta.seq` 加一；`putAccountDay`、`putWorkSnapshot` 还要把 `snapshot_seq` 加一。不在外层事务里被调用时，写和加一要包在一个事务里（用 `sql.ts` 的 `withTransaction`）。
- **序号**：`nextSerial` 在事务里读 `serial_<name>`、加一、写回、返回新值；两个进程同时取也不会重复。
- **作品**：`update` 追加记录时先 `SELECT COUNT(*)` 再插入多出来的部分，必须和行更新在同一个事务里。`list` 一次查出全部记录和反馈再按作品分组，不要每个作品查一次。
- **读也要一致**：作品、灵感的 `list`、`get` 要查好几张表；不在外层事务里时，几条查询包在一个读事务里（`BEGIN` … `COMMIT`），否则别的进程恰好在中间提交，会读到记录和反馈条数对不上的作品（评审压测复现过）。
- **数字必须是有限数**：作品的 totals、快照的 totals、账号每天的数字列遇到 NaN、无穷大直接抛 `STORE_FAILED`（JSON 会把它们写成 null，读回来时整张表都读不出来）。
- **快照**：`workSnapshots` 的「起点」用一条 SQL 取每个作品 from 之前 day 最大的一条。
- **复盘**：`save` 写入的 `updatedAt` 原样保存。
- **错误**：SQL 出错、JSON 解析失败一律包成 `LeafPressError("STORE_FAILED")`，message 说明是哪张表哪一列，不带值。

## 关键决策

1. **第 1 版脚本原样保留，第 2 版删旧建新**：版本号从 1 连续是升级逻辑的前提；作者机器上已有第一阶段的库（只有导入过的博客原稿，没有业务数据），升级前会自动备份。
2. **写事务一律 BEGIN IMMEDIATE**：命令行和本机服务同时写同一个作品时，后到的等前一个提交后再读，用例里的「读 → 按规则算 → 写」不会丢更新。租约令牌的比对也在这个事务里做。
3. **记录和反馈只追加**：用例把规则算出来的整个作品交给 `update`，记录库按条数补写新的；规则层不用关心哪些是新加的。
4. **快照存累计数**：每天存「到这天为止的总数」，新增在整理数据集时算；漏拉一天不会丢数，只会把两天的新增算在后一天。
5. **账号档案和密钥不进库**：档案是文件（agent 直接读），密钥在凭证文件；库里只有普通配置值和「过期」标记。

## 当前实现

| 文件 | 内容 |
|---|---|
| `open.ts` | 打开库、组装各 Repo、事务（嵌套时在外层事务里执行，同步异步都检查）、`backupTo` |
| `migrations.ts`、`migration-sql.ts` | 两版升级脚本（第 1 版原样保留）、升级逻辑（事务外备份到 backups/，进锁重读，全部脚本一个事务） |
| `sql.ts`、`repo-common.ts` | 事务公共件、读事务、JSON 列、空值和有限数检查 |
| `meta.ts` | 变更序号、编号序号 |
| `accounts.ts`、`settings.ts`、`ideas.ts`、`works.ts`、`works-mapping.ts`、`snapshots.ts`、`pulls.ts`、`notes.ts` | 各 Repo |
| `inspect.ts` | 体检用的只读查看 |

单测和集成测试共 43 个：包括真实子进程的「两个进程同时取号、同时改同一个作品」「4 写 1 读时读到的作品记录和反馈条数始终一致」「多个进程同时首次建库、同时从第 1 版升级」「另一个连接开着读事务时备份仍包含全部已提交数据」。经一轮独立评审（Claude 家的模型，压测 8 写进程 × 150 轮不丢更新、300 次并发建库和升级不出错），修了读取不一致、非有限数、升级备份误导、嵌套事务拦异步四处。

取号（`nextSerial`）也让变更序号加一（接口注释写的是「任何写操作都加一」），保持这样。

## 验证方式

单测在 `tests/store/`，每个用例用 `fs.mkdtemp` 建临时目录、用真实的 `openStore`，用完关闭并删除。必须覆盖：

1. 新库：升到第 2 版，新表都在、旧表都不在，meta 五行都是 0，`migration` 为 `{ from: 0, to: 2 }` 且没有备份。
2. **从第 1 版升级**：用第 1 版脚本建一个库并插几行旧数据，关闭后用正式的 `openStore` 打开：在 `backups/` 里生成备份（备份里有旧表和旧数据），升到第 2 版，旧表没了。
3. 第一阶段已有的升级测试（注入脚本模拟升级、脚本写错回滚、版本不连续、库比代码新）恢复并通过。
4. 每个 Repo 的增删改查，往返后字段一致：可选字段不存在 vs 有值、中文、Windows 路径的反斜杠、totals 的 JSON。
5. 作品：`update` 只追加新记录和新反馈；令牌三种写法；`work.lease` 为空时令牌被清掉；`remove` 连带删记录、反馈、快照。
6. 灵感：`workIds` 按来源算出来、按作品创建时间排；删作品后跟着少。
7. 快照：`workSnapshots` 带上起点；`putWorkSnapshot` 只在日期不早于 totals_day 时更新作品的 totals。
8. 拉取记录：`latest` 每个账号一条、是最近的。
9. 变更序号：每个写方法都让 seq 加一；快照写让 snapshot_seq 也加一；读方法不变。
10. 事务：抛错回滚（seq 也回滚）；异步回调被拒绝；嵌套调用在外层事务里执行。
11. **两个进程同时写**（用子进程，第一阶段的集成测试有现成做法可参考 git 历史里的 `tests/integration/`）：两个进程各取 50 次 `nextSerial("work")`，100 个值互不相同；两个进程各对同一个作品做 50 次「事务里 get → log 加一条 → update」，最后记录正好 100 条。
12. `inspectStore` 的已有测试按新的预期版本通过；`backupTo` 生成的文件能打开、数据一致。

`pnpm gate` 全部通过。

## 待扩展项

- M2：博客导入时作品带 `local_path`、`source_ref`；数据工具写快照。

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-10-05 | 写出规格，接口定在 `src/store/types.ts` |
| 2026-10-05 | 按规格评审修改：备份改用 `VACUUM INTO`；发布记录改为「意图 → 结果」流程并强制已发布带链接；运行表加租约；加 `completeStep`、`inspectStore` |
| 2026-10-05 | 发布记录加 `note` 列存「待核实」原因 |
| 2026-10-05 | 按实现评审修改：续约和交还不比较到期时间；只读查看改为直接读文件头；并发打开与升级的规则；事务边界；版本排序；测试必须用真实的 `openStore` 环境和多连接验证核心保证 |
| 2026-10-08 | M1：换成新模型（账号、配置项、灵感、作品与记录、快照、拉取记录、复盘、变更序号）；第一阶段的原稿、版本、发布记录、运行表删除；升级脚本第 2 版删旧建新 |
| 2026-10-09 | M1 实现完成；按评审修改：多表读取包读事务、拒绝非有限数、待执行的升级脚本一个事务跑完、进锁后发现别人升完就删掉自己的备份、嵌套事务也拦异步回调；升级备份放进 backups/ |
