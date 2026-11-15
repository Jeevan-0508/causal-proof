import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { hashCanonical } from "../domain/canonical";
import { migrateDatabase } from "../persistence/schema";
import { RoleSchema, type AnchorCheckpoint, type RetentionPolicy, type Role, type SecurityActivity, type TrustedKey, type User } from "./types";

export type SecurityStoreOptions = { filename?: string; now?: () => string };

const defaultFilename = () => process.env.CAUSAL_PROOF_DB_PATH || path.join(process.cwd(), ".data", "causal-proof.sqlite");
const text = (value: unknown) => String(value);

export function hashSecret(value: string): string { return hashCanonical(value); }
export async function hashPassword(password: string): Promise<string> { if (password.length < 12) throw new Error("Passwords must contain at least 12 characters."); return bcrypt.hash(password, 12); }
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> { return bcrypt.compare(password, passwordHash); }

export class SecurityStore {
  readonly filename: string;
  private readonly db: Database.Database;
  private readonly now: () => string;

  constructor(options: SecurityStoreOptions = {}) {
    this.filename = options.filename || defaultFilename();
    this.now = options.now || (() => new Date().toISOString());
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    this.db = new Database(this.filename);
    migrateDatabase(this.db);
  }

  close() { this.db.close(); }
  transaction<T>(work: () => T): T { return this.db.transaction(work)(); }
  rawForTests() { return this.db; }

  userCount(): number { return Number((this.db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count?: number } | undefined)?.count ?? 0); }

  createUser(input: { username: string; displayName: string; role: Role; passwordHash: string }, actorUserId: string | null = null): User {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw new Error("Username must contain 3-64 lowercase letters, numbers, dots, underscores, or hyphens.");
    RoleSchema.parse(input.role);
    const createdAt = this.now(); const id = `usr-${randomUUID()}`;
    this.transaction(() => {
      this.db.prepare(`INSERT INTO users(id, username, display_name, role, password_hash, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).run(id, username, input.displayName.trim(), input.role, input.passwordHash, createdAt, createdAt);
      this.appendSecurity("user.created", actorUserId, null, { userId: id, role: input.role }, createdAt);
    });
    return this.getUserById(id)!;
  }

  getUserById(id: string): User | null { const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined; return row ? this.rowToUser(row) : null; }
  getUserByUsername(username: string): { user: User; passwordHash: string } | null {
    const row = this.db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim().toLowerCase()) as Record<string, unknown> | undefined;
    return row ? { user: this.rowToUser(row), passwordHash: text(row.password_hash) } : null;
  }
  listUsers(): User[] { return (this.db.prepare("SELECT * FROM users ORDER BY username ASC").all() as Array<Record<string, unknown>>).map((row) => this.rowToUser(row)); }
  setUserDisabled(userId: string, disabled: boolean, actorUserId: string): User { const at = this.now(); this.db.prepare("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?").run(disabled ? 1 : 0, at, userId); if (disabled) this.revokeAllSessions(userId, actorUserId); this.appendSecurity(disabled ? "user.disabled" : "user.enabled", actorUserId, null, { userId, disabled }, at); const user = this.getUserById(userId); if (!user) throw new Error("Unknown user."); return user; }
  updateUserRole(userId: string, role: Role, actorUserId: string): User { if (role === "administrator") throw new Error("Administrator role changes require an explicit security administration workflow."); const at = this.now(); this.db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(role, at, userId); this.appendSecurity("user.role.changed", actorUserId, null, { userId, role }, at); const user = this.getUserById(userId); if (!user) throw new Error("Unknown user."); return user; }

  createSession(userId: string, ttlMinutes = 480): { session: { id: string; userId: string; expiresAt: string; createdAt: string; lastSeenAt: string }; token: string; csrfToken: string } {
    const createdAt = this.now(); const expiresAt = new Date(Date.parse(createdAt) + ttlMinutes * 60_000).toISOString(); const id = `ses-${randomUUID()}`; const token = randomBytes(32).toString("base64url"); const csrfToken = randomBytes(32).toString("base64url");
    this.db.prepare(`INSERT INTO sessions(id, user_id, token_hash, csrf_token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, userId, hashSecret(token), hashSecret(csrfToken), expiresAt, createdAt, createdAt);
    return { session: { id, userId, expiresAt, createdAt, lastSeenAt: createdAt }, token, csrfToken };
  }

  getSessionByToken(token: string): { session: { id: string; userId: string; expiresAt: string; createdAt: string; lastSeenAt: string }; csrfTokenHash: string } | null {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL`).get(hashSecret(token)) as Record<string, unknown> | undefined;
    if (!row || Date.parse(text(row.expires_at)) <= Date.parse(this.now())) return null;
    this.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(this.now(), row.id);
    return { session: { id: text(row.id), userId: text(row.user_id), expiresAt: text(row.expires_at), createdAt: text(row.created_at), lastSeenAt: this.now() }, csrfTokenHash: text(row.csrf_token_hash) };
  }
  revokeSession(sessionId: string, actorUserId: string | null): void { const at = this.now(); this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(at, sessionId); this.appendSecurity("session.revoked", actorUserId, null, { sessionId }, at); }
  revokeAllSessions(userId: string, actorUserId: string | null): void { const at = this.now(); this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(at, userId); this.appendSecurity("sessions.revoked_all", actorUserId, null, { userId }, at); }
  csrfMatches(sessionId: string, csrfToken: string): boolean { const row = this.db.prepare("SELECT csrf_token_hash FROM sessions WHERE id = ? AND revoked_at IS NULL").get(sessionId) as { csrf_token_hash?: string } | undefined; return Boolean(row && row.csrf_token_hash === hashSecret(csrfToken)); }

  addMembership(investigationId: string, userId: string, role: Role, actorUserId: string | null): void { const at = this.now(); this.db.prepare(`INSERT INTO investigation_members(investigation_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(investigation_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`).run(investigationId, userId, role, at, at); this.appendSecurity("membership.changed", actorUserId, investigationId, { userId, role }, at); }
  removeMembership(investigationId: string, userId: string, actorUserId: string | null): void { const at = this.now(); this.db.prepare("DELETE FROM investigation_members WHERE investigation_id = ? AND user_id = ?").run(investigationId, userId); this.appendSecurity("membership.removed", actorUserId, investigationId, { userId }, at); }
  membershipRole(investigationId: string, userId: string): Role | null { const row = this.db.prepare("SELECT role FROM investigation_members WHERE investigation_id = ? AND user_id = ?").get(investigationId, userId) as { role?: string } | undefined; return row?.role ? RoleSchema.parse(row.role) : null; }
  memberRows(investigationId: string): Array<{ userId: string; username: string; displayName: string; role: Role }> { return (this.db.prepare(`SELECT u.id AS userId, u.username, u.display_name AS displayName, m.role FROM investigation_members m JOIN users u ON u.id = m.user_id WHERE m.investigation_id = ? ORDER BY u.username`).all(investigationId) as Array<Record<string, unknown>>).map((row) => ({ userId: text(row.userId), username: text(row.username), displayName: text(row.displayName), role: RoleSchema.parse(row.role) })); }
  authorizedInvestigationIds(userId: string): string[] { return (this.db.prepare("SELECT investigation_id AS id FROM investigation_members WHERE user_id = ?").all(userId) as Array<Record<string, unknown>>).map((row) => text(row.id)); }

  rateLimit(key: string, maxAttempts = 5, windowMinutes = 15): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.parse(this.now()); const row = this.db.prepare("SELECT * FROM login_rate_limits WHERE rate_key = ?").get(key) as Record<string, unknown> | undefined;
    if (!row || now - Date.parse(text(row.window_started_at)) > windowMinutes * 60_000) { this.db.prepare("INSERT OR REPLACE INTO login_rate_limits(rate_key, attempt_count, window_started_at, blocked_until) VALUES (?, 1, ?, NULL)").run(key, this.now()); return { allowed: true, retryAfterSeconds: 0 }; }
    if (row.blocked_until && Date.parse(text(row.blocked_until)) > now) return { allowed: false, retryAfterSeconds: Math.ceil((Date.parse(text(row.blocked_until)) - now) / 1000) };
    const count = Number(row.attempt_count) + 1; const blockedUntil = count > maxAttempts ? new Date(now + windowMinutes * 60_000).toISOString() : null;
    this.db.prepare("UPDATE login_rate_limits SET attempt_count = ?, blocked_until = ? WHERE rate_key = ?").run(count, blockedUntil, key);
    return blockedUntil ? { allowed: false, retryAfterSeconds: windowMinutes * 60 } : { allowed: true, retryAfterSeconds: 0 };
  }
  resetRateLimit(key: string): void { this.db.prepare("DELETE FROM login_rate_limits WHERE rate_key = ?").run(key); }

  appendSecurity(action: string, actorUserId: string | null, investigationId: string | null, payload: Record<string, string | number | boolean | null>, recordedAt = this.now()): SecurityActivity {
    const previous = this.db.prepare("SELECT activity_hash AS hash FROM security_activity ORDER BY sequence DESC LIMIT 1").get() as { hash?: string } | undefined;
    const activityId = `sec-${randomUUID()}`; const payloadHash = hashCanonical(payload); const input = { activityId, action, actorUserId, investigationId, recordedAt, previousHash: previous?.hash ?? null, payloadHash, schemaVersion: 1 }; const activityHash = hashCanonical(input);
    this.db.prepare(`INSERT INTO security_activity(activity_id, action, actor_user_id, investigation_id, recorded_at, previous_hash, payload_hash, activity_hash, schema_version, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(activityId, action, actorUserId, investigationId, recordedAt, previous?.hash ?? null, payloadHash, activityHash, 1, JSON.stringify(payload));
    this.db.prepare(`INSERT INTO security_activity_state(id, activity_count, head_hash) VALUES (1, 1, ?) ON CONFLICT(id) DO UPDATE SET activity_count = activity_count + 1, head_hash = excluded.head_hash`).run(activityHash);
    return { activityId, action, actorUserId, investigationId, recordedAt, payload };
  }
  listSecurityActivity(limit = 200): SecurityActivity[] { return (this.db.prepare("SELECT * FROM security_activity ORDER BY sequence DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map((row) => ({ activityId: text(row.activity_id), action: text(row.action), actorUserId: row.actor_user_id ? text(row.actor_user_id) : null, investigationId: row.investigation_id ? text(row.investigation_id) : null, recordedAt: text(row.recorded_at), payload: JSON.parse(text(row.payload_json)) })); }
  verifySecurityActivity(): { valid: boolean; checked: number; issues: string[] } { const rows = this.db.prepare("SELECT * FROM security_activity ORDER BY sequence ASC").all() as Array<Record<string, unknown>>; const issues: string[] = []; let previous: string | null = null; rows.forEach((row, index) => { const payload = JSON.parse(text(row.payload_json)); const payloadHash = hashCanonical(payload); const input = { activityId: text(row.activity_id), action: text(row.action), actorUserId: row.actor_user_id ? text(row.actor_user_id) : null, investigationId: row.investigation_id ? text(row.investigation_id) : null, recordedAt: text(row.recorded_at), previousHash: previous, payloadHash, schemaVersion: Number(row.schema_version) }; if (row.previous_hash !== previous) issues.push(`Broken security activity link at ${row.activity_id}.`); if (row.payload_hash !== payloadHash) issues.push(`Security payload hash mismatch at ${row.activity_id}.`); if (row.activity_hash !== hashCanonical(input)) issues.push(`Security activity hash mismatch at ${row.activity_id}.`); if (Number(row.sequence) !== index + 1) issues.push(`Security activity sequence mismatch at ${row.activity_id}.`); previous = text(row.activity_hash); }); const state = this.db.prepare("SELECT * FROM security_activity_state WHERE id = 1").get() as { activity_count?: number; head_hash?: string } | undefined; if (state && Number(state.activity_count) !== rows.length) issues.push("Security activity count anchor mismatch."); if (state && (state.head_hash ?? null) !== previous) issues.push("Security activity head anchor mismatch."); return { valid: issues.length === 0, checked: rows.length, issues }; }

  registerKey(key: TrustedKey, createdBy: string | null): void { this.db.prepare(`INSERT INTO trusted_keys(key_id, algorithm, public_key_pem, status, valid_from, revoked_at, replaced_by, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(key.keyId, key.algorithm, key.publicKeyPem, key.status, key.validFrom, key.revokedAt, key.replacedBy, createdBy, key.createdAt); }
  revokeKey(keyId: string, replacedBy: string | null, actorUserId: string | null): void { const at = this.now(); this.db.prepare("UPDATE trusted_keys SET status = 'revoked', revoked_at = ?, replaced_by = ? WHERE key_id = ? AND status = 'active'").run(at, replacedBy, keyId); this.appendSecurity("key.revoked", actorUserId, null, { keyId, replacedBy }, at); }
  getKey(keyId: string): TrustedKey | null { const row = this.db.prepare("SELECT * FROM trusted_keys WHERE key_id = ?").get(keyId) as Record<string, unknown> | undefined; return row ? { keyId: text(row.key_id), algorithm: "Ed25519", publicKeyPem: text(row.public_key_pem), status: text(row.status) as TrustedKey["status"], validFrom: text(row.valid_from), revokedAt: row.revoked_at ? text(row.revoked_at) : null, replacedBy: row.replaced_by ? text(row.replaced_by) : null, createdAt: text(row.created_at) } : null; }
  listKeys(): TrustedKey[] { return (this.db.prepare("SELECT * FROM trusted_keys ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map((row) => this.getKey(text(row.key_id))!).filter(Boolean); }

  saveCheckpoint(checkpoint: AnchorCheckpoint): void { this.db.prepare(`INSERT OR REPLACE INTO anchor_checkpoints(checkpoint_id, investigation_id, checkpoint_sequence, event_count, ledger_head_hash, schema_version, created_at, key_id, algorithm, signature, manifest_json, anchor_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(checkpoint.checkpointId, checkpoint.investigationId, checkpoint.checkpointSequence, checkpoint.eventCount, checkpoint.ledgerHeadHash, checkpoint.schemaVersion, checkpoint.createdAt, checkpoint.keyId, checkpoint.algorithm, checkpoint.signature, JSON.stringify(checkpoint.manifest), checkpoint.anchorPath); }
  listCheckpoints(investigationId: string): AnchorCheckpoint[] { return (this.db.prepare("SELECT * FROM anchor_checkpoints WHERE investigation_id = ? ORDER BY checkpoint_sequence DESC").all(investigationId) as Array<Record<string, unknown>>).map((row) => ({ checkpointId: text(row.checkpoint_id), investigationId: text(row.investigation_id), checkpointSequence: Number(row.checkpoint_sequence), eventCount: Number(row.event_count), ledgerHeadHash: text(row.ledger_head_hash), schemaVersion: Number(row.schema_version), createdAt: text(row.created_at), keyId: text(row.key_id), algorithm: "Ed25519", signature: text(row.signature), manifest: JSON.parse(text(row.manifest_json)), anchorPath: text(row.anchor_path) })); }

  saveRetentionPolicy(investigationId: string, policy: RetentionPolicy, actorUserId: string): void { const at = this.now(); this.db.prepare(`INSERT INTO retention_policies(investigation_id, policy_json, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(investigation_id) DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at`).run(investigationId, JSON.stringify(policy), at, at); this.appendSecurity("retention.policy.changed", actorUserId, investigationId, { retentionDays: policy.retentionDays, legalHold: policy.legalHold }, at); }
  getRetentionPolicy(investigationId: string): RetentionPolicy | null { const row = this.db.prepare("SELECT policy_json AS policyJson FROM retention_policies WHERE investigation_id = ?").get(investigationId) as { policyJson?: string } | undefined; return row ? JSON.parse(text(row.policyJson)) as RetentionPolicy : null; }
  recordRetentionAction(actionId: string, investigationId: string, actorUserId: string, action: string, payload: Record<string, unknown>, recordedAt = this.now()): void { this.db.prepare(`INSERT INTO retention_actions(action_id, investigation_id, actor_user_id, action, recorded_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)`).run(actionId, investigationId, actorUserId, action, recordedAt, JSON.stringify(payload)); this.appendSecurity(`retention.${action}`, actorUserId, investigationId, { action, actionId }, recordedAt); }
  recordLogicalRetention(investigationId: string, evidenceId: string, actionId: string, reason: string, recordedAt = this.now()): void { this.db.prepare(`INSERT OR IGNORE INTO retention_records(investigation_id, evidence_id, action_id, recorded_at, reason) VALUES (?, ?, ?, ?, ?)`).run(investigationId, evidenceId, actionId, recordedAt, reason); }
  retainedEvidenceIds(investigationId: string): string[] { return (this.db.prepare("SELECT evidence_id AS evidenceId FROM retention_records WHERE investigation_id = ?").all(investigationId) as Array<Record<string, unknown>>).map((row) => text(row.evidenceId)); }

  private rowToUser(row: Record<string, unknown>): User { return { id: text(row.id), username: text(row.username), displayName: text(row.display_name), role: RoleSchema.parse(row.role), disabled: Boolean(row.disabled), createdAt: text(row.created_at), updatedAt: text(row.updated_at) }; }
}

export function openSecurityStore(options: SecurityStoreOptions = {}): SecurityStore { return new SecurityStore(options); }
