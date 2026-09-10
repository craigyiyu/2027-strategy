/**
 * SQLite database bootstrap + schema (migrations by user_version).
 * All timestamps UTC ISO-8601 strings. Raw answers encrypted via FieldCipher
 * before insert; never stored as plaintext (SEC-06).
 */
import Database from 'better-sqlite3';

export const SCHEMA_MIGRATIONS_V2 = `
  ALTER TABLE sessions ADD COLUMN report_job_status TEXT NOT NULL DEFAULT 'idle';
  ALTER TABLE sessions ADD COLUMN report_job_error TEXT;
  ALTER TABLE sessions ADD COLUMN report_job_started_at TEXT;
  ALTER TABLE sessions ADD COLUMN reflection_json TEXT;
`;

export const SCHEMA_MIGRATIONS: string[] = [
  // v1 — initial private-beta schema
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    public_token_hash TEXT NOT NULL UNIQUE,
    report_token_hash TEXT,
    language TEXT NOT NULL,
    lens TEXT NOT NULL,
    role_band TEXT NOT NULL,
    industry_band TEXT NOT NULL,
    organization_alias TEXT,
    privacy_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    core_stage INTEGER NOT NULL DEFAULT 0,
    current_stage TEXT,
    followup_count INTEGER NOT NULL DEFAULT 0,
    reflection_state TEXT NOT NULL DEFAULT 'none',
    method_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    confirmed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_status ON sessions(status);
  CREATE INDEX idx_sessions_created ON sessions(created_at);

  CREATE TABLE responses (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    stage_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    answer_ciphertext TEXT,
    answer_nonce TEXT,
    answer_iv TEXT,
    answer_tag TEXT,
    extracted_json TEXT,
    sensitivity_state TEXT NOT NULL DEFAULT 'clear',
    quality_label TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    superseded_at TEXT
  );
  CREATE INDEX idx_responses_session ON responses(session_id);
  CREATE UNIQUE INDEX idx_responses_active_stage
    ON responses(session_id, stage_id) WHERE is_active = 1;

  CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    report_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'generating',
    model_id TEXT,
    prompt_version TEXT,
    schema_version TEXT,
    generated_at TEXT NOT NULL,
    superseded_at TEXT,
    email_sent_at TEXT
  );
  CREATE INDEX idx_reports_session ON reports(session_id);

  CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    email_normalized TEXT NOT NULL UNIQUE,
    first_name TEXT,
    verification_state TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE consents (
    id TEXT PRIMARY KEY,
    contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    granted INTEGER NOT NULL,
    granted_at TEXT,
    withdrawn_at TEXT
  );
  CREATE INDEX idx_consents_session ON consents(session_id);
  CREATE INDEX idx_consents_contact ON consents(contact_id);

  CREATE TABLE pulse_tags (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tag_key TEXT NOT NULL,
    tag_value TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_pulse_tags ON pulse_tags(tag_key, tag_value);

  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL,
    comments_ciphertext TEXT,
    comments_nonce TEXT,
    comments_iv TEXT,
    comments_tag TEXT,
    followup_requested INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE emails (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    contact_id TEXT,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL,
    subject_hash TEXT,
    body_hash TEXT,
    error_category TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
  );

  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    session_id TEXT,
    report_id TEXT,
    detail_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_audit_session ON audit_log(session_id);

  CREATE TABLE deletion_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    receipt_token_hash TEXT,
    requested_at TEXT NOT NULL,
    reason TEXT
  );

  CREATE TABLE analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    props_json TEXT NOT NULL,
    ts TEXT NOT NULL
  );
  CREATE INDEX idx_analytics_name ON analytics_events(name);
  `,
  // v2 — async report generation + cached reflection
  SCHEMA_MIGRATIONS_V2,
];

export function openDatabase(filename = ':memory:'): Database.Database {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: Database.Database): void {
  const row = db.pragma('user_version', { simple: true }) as number;
  const current = Number(row) || 0;
  for (let v = current; v < SCHEMA_MIGRATIONS.length; v++) {
    const sql = SCHEMA_MIGRATIONS[v];
    if (!sql) continue;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.pragma(`user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export type { Database };
