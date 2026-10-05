# 记录库 · SQLite 存储

> 模块定位：LeafPress 全部数据的落盘与查询 · 对应代码：`src/store/` · 所属里程碑：[M0 地基](../roadmap.md#m0-地基) · 状态：开发中 · 最近更新：2026-10-05

## 职责与边界

- 管：数据库文件的打开、表结构建立与升级（升级前备份）、作品 / 原稿 / 版本 / 发布记录 / 工作流运行的读写、防重复发布、发布状态总览查询。
- 不管：业务判断（该不该发、发到哪），这些在工作流和平台接入里。

## 结构与数据流

对外接口已经定死在 `src/store/types.ts`（`Store`、各个 Repo、`OpenStoreOptions`），实现必须完全符合，不得改这个文件。

| 文件 | 内容 |
|---|---|
| `src/store/open.ts` | `openStore(dbFile: string, options?: OpenStoreOptions): Store`：打开库、设置参数、执行升级、组装各 Repo |
| `src/store/migrations.ts` | `MIGRATIONS: readonly Migration[]` 正式升级脚本；`migrate(db, dbFile, migrations)` 升级逻辑 |
| `src/store/sql.ts` | JSON 列的读写、null 与 undefined 互转、行对象到类型的映射等公共件 |
| `src/store/works.ts`、`sources.ts`、`variants.ts`、`publications.ts`、`overview.ts` | 各 Repo 的实现，每个文件一个工厂函数，接收 db 和公共依赖 |
| `src/store/runs.ts` | `RunStore` 的 SQLite 实现（接口见 `src/workflows/types.ts`） |

### 打开数据库

- 用 `node:sqlite` 的 `DatabaseSync`。打开后依次执行 `PRAGMA foreign_keys = ON`、`PRAGMA journal_mode = WAL`、`PRAGMA busy_timeout = 5000`。
- 数据库文件所在目录不存在就先建。
- 编号缺省用 `crypto.randomUUID()`，时间缺省用 `new Date().toISOString()`，两者都可注入。

### 表结构（升级脚本第 1 版）

```sql
CREATE TABLE works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  kind TEXT NOT NULL,
  platform TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  locale TEXT,
  content_hash TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (platform, ref)
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  mime TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  derived_from TEXT REFERENCES assets(id),
  created_at TEXT NOT NULL
);

CREATE TABLE variants (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  platform TEXT NOT NULL,
  format TEXT NOT NULL,
  target_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  draft_path TEXT,
  options TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_variants_source ON variants (source_id, platform, format, target_key);

CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id),
  platform TEXT NOT NULL,
  format TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT,
  platform_content_id TEXT,
  published_at TEXT NOT NULL,
  raw TEXT
);
CREATE INDEX idx_publications_variant ON publications (variant_id);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  params TEXT NOT NULL,
  state TEXT NOT NULL,
  cursor INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_runs_state ON runs (state, created_at);

CREATE TABLE run_steps (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  status TEXT NOT NULL,
  input_hashes TEXT NOT NULL DEFAULT '{}',
  outputs TEXT,
  wait TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY (run_id, step_id)
);
```

`params`、`options`、`input_hashes`、`outputs`、`wait`、`raw` 存 JSON 文本；读回时解析，解析失败抛 `STORE_FAILED`（说明是哪张表哪一列）。读回时 SQL 的 NULL 一律变成「字段不存在」。

### 升级规则

- 版本号存在 `PRAGMA user_version`。打开时比较当前版本和升级脚本的最大版本。
- 有待执行的升级、而且数据库文件在打开前就已存在、当前版本大于 0 时：先执行 `PRAGMA wal_checkpoint(TRUNCATE)`，再把数据库文件复制成 `<库文件>.bak-v<当前版本>-<YYYYMMDDHHmmss>`，把路径写进 `migration.backupPath`。
- 每个升级脚本连同 `user_version` 的更新放在同一个事务里执行；任何一个失败就抛 `MIGRATION_FAILED`，hint 写明备份文件路径。
- 升级脚本的版本号必须从 1 开始连续递增，否则抛 `MIGRATION_FAILED`（防止写错）。
- 数据库版本比代码认识的最大版本还高（用旧代码打开新库）时，抛 `MIGRATION_FAILED`，提示升级 LeafPress。

### 各 Repo 的规则

接口和注释见 `src/store/types.ts`，补充：

- `sources.upsert`：在一个事务里完成「查找 → 新建作品和原稿，或更新原稿」。新建时作品标题取原稿标题。只有字段真的变了才更新 `updated_at` 并返回 `changed: true`。
- `variants.update`：`updated_at` 每次都更新。
- `publications.record` 和 `publications.confirm`：用 `BEGIN IMMEDIATE` 开写事务，先查重再写，保证两个进程同时登记同一目标时只有一个成功。`ALREADY_PUBLISHED` 的 message 写明平台、形态和已有链接。平台和形态从版本上复制，不信任调用方。
- `publicationOverview`：返回给定原稿下的全部版本，左连接发布记录，按原稿编号、平台、形态、目标、版本创建时间、发布时间排序。传入空数组时直接返回空数组，不拼出 `IN ()` 这种非法语句。
- `transaction`：`BEGIN IMMEDIATE` … `COMMIT`，出错 `ROLLBACK` 后原样抛出；正在事务中又调用 `transaction` 时抛 `STORE_FAILED`。Repo 内部自己需要事务的方法，在外层事务里被调用时要能正常工作（检测到已在事务中就不再开新事务）。
- `runs`（RunStore）：完全照 `src/workflows/types.ts` 的注释实现。`transitionRun` 必须是一条带 `WHERE id = ? AND state IN (...)` 条件的 UPDATE，按受影响行数判断成功与否，同时把 `updated_at` 改成当前时间；`updateRun`、`updateStep` 里值为 `null` 的字段写成 SQL NULL，值为 `undefined` 的字段不改。

## 关键决策

1. 用 Node 自带的 SQLite：Windows 上不用编译原生模块，测量过打开内存库只要 1 毫秒，没有警告输出。
2. 防重复发布放在记录库里用写事务保证，不依赖调用方先查。
3. 升级前自动备份，升级失败时有退路。
4. 读回统一用 undefined 表示空，和 TypeScript 的可选字段一致，避免 null 和 undefined 混用。

## 当前实现

待实现。

## 验证方式

单测放在 `tests/store/`，每个用例用 `fs.mkdtemp` 建临时目录放库文件，用完关闭并删除。必须覆盖：

1. 新库：表都建好，`user_version` 为 1，`migration` 为 `{ from: 0, to: 1 }` 且没有备份。
2. 再次打开同一个库：不重复升级，`from` 和 `to` 都是 1。
3. 用注入的两版升级脚本模拟从 1 升到 2：生成备份文件，内容是升级前的库；第 2 版脚本故意写错时抛 `MIGRATION_FAILED`、版本仍是 1、数据没丢。
4. 版本号不连续的升级脚本列表被拒绝；数据库版本高于代码时被拒绝。
5. `sources.upsert`：新建（同时建作品）、无变化、有变化三种情况的返回值。
6. `variants`：创建默认值、更新、按原稿列出、原稿不存在时报错。
7. `publications.record`：首次成功并把版本改为 published；同一目标再次登记抛 `ALREADY_PUBLISHED` 且不写入；不同 targetKey（回答两个不同问题）都能成功；unverified 不触发查重；`confirm` 把待核实改成已发布并查重。
8. `publicationOverview`：多原稿、多版本、有无发布记录混合；空数组输入。
9. `transaction`：成功提交、抛错回滚、嵌套调用报错。
10. JSON 列往返：嵌套对象、中文、Windows 路径里的反斜杠。
11. **工作流存储约定**：新建 `tests/store/run-store.test.ts`，调用 `tests/contracts/run-store.contract.ts` 里的 `describeRunStoreContract("SQLite 存储", 工厂)`，全部通过。约定测试文件不许改。

`pnpm gate` 全部通过。

## 待扩展项

- M1：资产上传缓存表（资产哈希 → 平台媒体编号）。
- M3：素材、题目表。
- M5：数据快照表。

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-10-05 | 写出规格，接口定在 `src/store/types.ts` |
