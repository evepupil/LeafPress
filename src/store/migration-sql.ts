export const BUSINESS_SCHEMA_SQL = `
      DROP TABLE IF EXISTS run_steps;
      DROP TABLE IF EXISTS runs;
      DROP TABLE IF EXISTS publications;
      DROP TABLE IF EXISTS variants;
      DROP TABLE IF EXISTS assets;
      DROP TABLE IF EXISTS sources;
      DROP TABLE IF EXISTS works;

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
    `;

// 第 3 版只新增候选相关表和序号，升级作者真实数据目录时不触碰旧表和旧记录。
export const IDEA_CANDIDATES_SCHEMA_SQL = `
      CREATE TABLE idea_candidates (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        score REAL NOT NULL,
        state TEXT NOT NULL,
        idea_id TEXT,
        payload TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idea_candidates_state ON idea_candidates(state);
      CREATE UNIQUE INDEX idea_candidates_idea ON idea_candidates(idea_id) WHERE idea_id IS NOT NULL;

      CREATE TABLE idea_probes (
        key TEXT PRIMARY KEY,
        at TEXT NOT NULL
      );

      INSERT INTO meta (key, value) VALUES ('serial_candidate', 0);
    `;
