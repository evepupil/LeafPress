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
  lease_owner TEXT,
  lease_expires_at TEXT,
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
- 有待执行的升级、而且数据库文件在打开前就已存在、当前版本大于 0 时：先用 `VACUUM INTO '<备份路径>'` 生成备份，备份路径为 `<库文件>.bak-v<当前版本>-<YYYYMMDDHHmmss>`，写进 `migration.backupPath`。路径里的单引号要转义成两个单引号。**不要用「检查点 + 复制文件」的办法**：评审实测过，有别的连接在读时检查点会失败，复制出来的文件会漏掉 WAL 里已提交的数据；`VACUUM INTO` 由 SQLite 自己读一份一致的快照写出去，不受影响。备份失败就抛 `MIGRATION_FAILED`，不执行升级。
- 每个升级脚本连同 `user_version` 的更新放在同一个事务里执行；任何一个失败就抛 `MIGRATION_FAILED`，hint 写明备份文件路径。
- 升级脚本的版本号必须从 1 开始连续递增，否则抛 `MIGRATION_FAILED`（防止写错）。
- 数据库版本比代码认识的最大版本还高（用旧代码打开新库）时，抛 `MIGRATION_FAILED`，提示升级 LeafPress。

### 各 Repo 的规则

接口和注释见 `src/store/types.ts`，补充：

- `sources.upsert`：在一个事务里完成「查找 → 新建作品和原稿，或更新原稿」。新建时作品标题取原稿标题。只有字段真的变了才更新 `updated_at` 并返回 `changed: true`。
- `variants.update`：`updated_at` 每次都更新。
- **发布记录**（`publications`，接口注释见 `src/store/types.ts`）。流程是「先登记意图，再调平台，最后补结果」，这样平台已经发出去、本地还没来得及登记时进程崩了，留下的 pending 记录会挡住自动重发：

```
begin ──► pending ──complete──► published（带链接，版本同时改成 published）
                 ├─complete──► unverified ──confirm──► published
                 │                          └─discard──► 删除（可以重新发）
                 └─abort────► 删除（确定没发出去）
recordManual ──► published（作者手动发完回填链接）
```

  - 目标 =（原稿, 平台, 形态, targetKey），通过版本表关联出来；平台和形态一律从版本上取。
  - 「占位」= 目标上存在 published、pending 或 unverified 记录。`begin` 和 `recordManual` 遇到 published 抛 `ALREADY_PUBLISHED`（message 写明平台、形态、已有链接），遇到 pending 或 unverified 抛 `PUBLISH_IN_DOUBT`（hint：先核实上次的发布结果）。
  - 所有写方法都用 `BEGIN IMMEDIATE` 开写事务，先查再写，两个进程同时操作同一目标时只有一个成功。
  - published 状态的记录必须有非空链接：`complete` 的 published 结果、`recordManual`、`confirm` 的链接为空串时抛 `STORE_FAILED`。
  - 状态不符合前置条件（比如对 published 调 `complete`）抛 `STORE_FAILED`。
- `publicationOverview`：返回给定原稿下的全部版本，左连接发布记录，按原稿编号、平台、形态、目标、版本创建时间、发布时间排序。传入空数组时直接返回空数组，不拼出 `IN ()` 这种非法语句。
- `transaction`：`BEGIN IMMEDIATE` … `COMMIT`，出错 `ROLLBACK` 后原样抛出；正在事务中又调用 `transaction` 时抛 `STORE_FAILED`。Repo 内部自己需要事务的方法，在外层事务里被调用时要能正常工作（检测到已在事务中就不再开新事务）。
- `runs`（RunStore）：完全照 `src/workflows/types.ts` 的注释实现。
  - `acquireRun`、`renewLease`、`releaseRun`、`transitionRun` 都是一条带条件的 UPDATE（条件写在 `WHERE` 里，包括状态、租约持有者、租约到期时间的比较），按受影响行数判断成功与否；成功时同时把 `updated_at` 改成当前时间。时间都是同一格式的 ISO 字符串，可以直接按字符串比较大小。
  - `releaseRun` 和 `transitionRun`（目标状态不是 running 时）把 `lease_owner`、`lease_expires_at` 置为 NULL。
  - `completeStep` 在一个事务里更新步骤和运行的游标。
  - `updateRun`、`updateStep` 里值为 `null` 的字段写成 SQL NULL，值为 `undefined` 的字段不改。
- **只读查看** `inspectStore(dbFile): StoreInspection`（放在 `src/store/inspect.ts`）：库文件不存在返回 `{ exists: false, expectedVersion }`；存在则用 `new DatabaseSync(dbFile, { readOnly: true })` 打开，读 `PRAGMA user_version` 后立即关闭。不建目录、不建库、不升级。体检命令用它。

## 关键决策

1. 用 Node 自带的 SQLite：Windows 上不用编译原生模块，测量过打开内存库只要 1 毫秒，没有警告输出。
2. 防重复发布放在记录库里用写事务保证，不依赖调用方先查；发布前先登记意图，进程在「平台已发、本地未登记」时崩溃也不会自动重发。
3. 升级前用 `VACUUM INTO` 做一致性备份，升级失败时有退路。
4. 工作流的执行权用租约表示（持有者 + 到期时间），长步骤靠续约保持，过期才能被接管。
5. 读回统一用 undefined 表示空，和 TypeScript 的可选字段一致，避免 null 和 undefined 混用。

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
7. 发布记录：`begin` → `complete(published)` 后版本变为 published；之后同一目标 `begin` 或 `recordManual` 抛 `ALREADY_PUBLISHED` 且不写入；有 pending 时再 `begin` 抛 `PUBLISH_IN_DOUBT`；`complete(unverified)` 后再 `begin` 也抛 `PUBLISH_IN_DOUBT`，`confirm` 后变为 published，`discard` 后可以重新 `begin`；`abort` 删除 pending；不同 targetKey（回答两个不同问题）互不影响；published 缺链接被拒绝；前置状态不对抛 `STORE_FAILED`。
8. `publicationOverview`：多原稿、多版本、有无发布记录混合；空数组输入。
9. `transaction`：成功提交、抛错回滚、嵌套调用报错。
10. JSON 列往返：嵌套对象、中文、Windows 路径里的反斜杠。
11. **工作流存储约定**：新建 `tests/store/run-store.test.ts`，调用 `tests/contracts/run-store.contract.ts` 里的 `describeRunStoreContract("SQLite 存储", 工厂)`，全部通过。约定测试文件不许改。
12. `inspectStore`：文件不存在时不会建出文件；存在时返回版本且文件内容不变（比较前后哈希）。
13. 升级备份的一致性：用第二个连接开着读事务时执行带升级的打开，备份文件里包含全部已提交的数据。

`pnpm gate` 全部通过。

## 待扩展项

- M1：资产上传缓存表（资产哈希 → 平台媒体编号）。
- M3：素材、题目表。
- M5：数据快照表。

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-10-05 | 写出规格，接口定在 `src/store/types.ts` |
| 2026-10-05 | 按规格评审修改：备份改用 `VACUUM INTO`；发布记录改为「意图 → 结果」流程并强制已发布带链接；运行表加租约；加 `completeStep`、`inspectStore` |
