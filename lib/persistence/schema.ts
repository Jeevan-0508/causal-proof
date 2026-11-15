import type Database from "better-sqlite3";

export const DATABASE_SCHEMA_VERSION = 3;

const migrations: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      investigation_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS evidence_records (
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      available_at TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (investigation_id, evidence_id)
    );
    CREATE TABLE IF NOT EXISTS evidence_mutations (
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      mutation_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      mutation_json TEXT NOT NULL,
      PRIMARY KEY (investigation_id, mutation_id),
      FOREIGN KEY (investigation_id, evidence_id) REFERENCES evidence_records(investigation_id, evidence_id)
    );
    CREATE TABLE IF NOT EXISTS causal_graph_versions (
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      graph_hash TEXT NOT NULL,
      graph_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (investigation_id, version)
    );
    CREATE TABLE IF NOT EXISTS decision_replays (
      replay_id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      decision_point_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      replay_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS counterfactual_branches (
      branch_id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      parent_investigation_id TEXT NOT NULL,
      fork_decision_point_id TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      result_hash TEXT NOT NULL,
      branch_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (parent_investigation_id) REFERENCES investigations(id)
    );
    CREATE TABLE IF NOT EXISTS simulations (
      input_hash TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      seed INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      input_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS export_manifests (
      manifest_id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      package_version TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      event_rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      previous_event_hash TEXT,
      canonical_payload_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE (investigation_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS audit_events_investigation_sequence ON audit_events(investigation_id, sequence);
    CREATE TABLE IF NOT EXISTS audit_chain_state (
      investigation_id TEXT PRIMARY KEY REFERENCES investigations(id) ON DELETE CASCADE,
      event_count INTEGER NOT NULL,
      head_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS database_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO database_meta(key, value) VALUES ('schema_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `,
  2: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_token_hash ON sessions(token_hash);
    CREATE TABLE IF NOT EXISTS investigation_members (
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (investigation_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS investigation_members_user ON investigation_members(user_id, investigation_id);
    CREATE TABLE IF NOT EXISTS login_rate_limits (
      rate_key TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL,
      window_started_at TEXT NOT NULL,
      blocked_until TEXT
    );
    CREATE TABLE IF NOT EXISTS security_activity (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id TEXT NOT NULL UNIQUE,
      action TEXT NOT NULL,
      actor_user_id TEXT REFERENCES users(id),
      investigation_id TEXT REFERENCES investigations(id),
      recorded_at TEXT NOT NULL,
      previous_hash TEXT,
      payload_hash TEXT NOT NULL,
      activity_hash TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS security_activity_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      activity_count INTEGER NOT NULL,
      head_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS trusted_keys (
      key_id TEXT PRIMARY KEY,
      algorithm TEXT NOT NULL,
      public_key_pem TEXT NOT NULL,
      status TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      revoked_at TEXT,
      replaced_by TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS anchor_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      checkpoint_sequence INTEGER NOT NULL,
      event_count INTEGER NOT NULL,
      ledger_head_hash TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      key_id TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      signature TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      anchor_path TEXT NOT NULL,
      UNIQUE (investigation_id, checkpoint_sequence)
    );
    CREATE TABLE IF NOT EXISTS retention_policies (
      investigation_id TEXT PRIMARY KEY REFERENCES investigations(id) ON DELETE CASCADE,
      policy_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS retention_records (
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      PRIMARY KEY (investigation_id, evidence_id),
      FOREIGN KEY (investigation_id, evidence_id) REFERENCES evidence_records(investigation_id, evidence_id)
    );
    CREATE TABLE IF NOT EXISTS retention_actions (
      action_id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    INSERT INTO database_meta(key, value) VALUES ('security_schema_version', '2')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `,
  3: `
    CREATE TABLE IF NOT EXISTS copilot_runs (
      run_id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      question TEXT NOT NULL,
      mode TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_version TEXT NOT NULL,
      knowledge_cutoff TEXT,
      replay_id TEXT,
      replay_hash TEXT,
      input_hash TEXT NOT NULL,
      answer_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS copilot_runs_investigation_created ON copilot_runs(investigation_id, created_at);
    CREATE TABLE IF NOT EXISTS copilot_reviews (
      review_id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      suggestion_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL,
      rationale TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS copilot_reviews_investigation_reviewed ON copilot_reviews(investigation_id, reviewed_at);
    INSERT INTO database_meta(key, value) VALUES ('copilot_schema_version', '3')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `,
};

export function migrateDatabase(db: Database.Database): number {
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  const current = Number(db.pragma("user_version", { simple: true }) || 0);
  for (let version = current + 1; version <= DATABASE_SCHEMA_VERSION; version += 1) {
    const migration = migrations[version];
    if (!migration) throw new Error(`Missing database migration ${version}.`);
    db.transaction(() => {
      db.exec(migration);
      db.pragma(`user_version = ${version}`);
    })();
  }
  return DATABASE_SCHEMA_VERSION;
}

export const migrationSql = migrations;
