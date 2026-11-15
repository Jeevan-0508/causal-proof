import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { openInvestigationRepository } from "../lib/persistence/sqlite";
import { createCheckpoint, FileAnchorStore, verifyAgainstAnchor } from "../lib/security/anchors";
import { createEncryptedBackup, decryptBackup, restoreEncryptedBackup } from "../lib/security/backup";
import { authenticate, isAllowed } from "../lib/security/auth";
import { LocalFileKeyProvider } from "../lib/security/keys";
import { applyRetention, previewRetention } from "../lib/security/retention";
import { hashPassword, openSecurityStore } from "../lib/security/store";
import type { AuthenticatedRequest } from "../lib/security/auth";

const clone = () => JSON.parse(JSON.stringify(demoInvestigation));
function tempRoot() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "causal-proof-phase5-")); return { root, db: path.join(root, "db", "investigation.sqlite"), keys: path.join(root, "keys"), anchors: path.join(root, "anchors"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }; }
const now = () => "2026-05-01T12:00:00.000Z";

async function seed() {
  const temp = tempRoot(); const repo = openInvestigationRepository({ filename: temp.db, now }); const security = openSecurityStore({ filename: temp.db, now }); const passwordHash = await hashPassword("correct horse battery staple"); const user = security.createUser({ username: "lead.user", displayName: "Lead User", role: "lead_investigator", passwordHash }); repo.createInvestigation(clone(), user.id); security.addMembership(demoInvestigation.id, user.id, "lead_investigator", user.id); return { temp, repo, security, user };
}

function requestForSession(token: string, csrfToken?: string): Request { return new Request("http://localhost/api", { headers: { cookie: `causal_proof_session=${encodeURIComponent(token)}`, ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) } }); }

describe("Phase 5 identity, trust, recovery, and retention controls", () => {
  it("enforces role permissions and investigation membership boundaries", async () => {
    const seeded = await seed(); const adminHash = await hashPassword("another correct horse battery"); const auditor = seeded.security.createUser({ username: "audit.user", displayName: "Auditor", role: "read_only_auditor", passwordHash: adminHash }); const admin = seeded.security.createUser({ username: "admin.user", displayName: "Admin", role: "administrator", passwordHash: adminHash });
    const leadSession = seeded.security.createSession(seeded.user.id); const auditorSession = seeded.security.createSession(auditor.id); const adminSession = seeded.security.createSession(admin.id);
    const leadAuth = authenticate(requestForSession(leadSession.token), seeded.security)!; const auditorAuth = authenticate(requestForSession(auditorSession.token), seeded.security)!; const adminAuth = authenticate(requestForSession(adminSession.token), seeded.security)!;
    expect(isAllowed(leadAuth, "evidence.mutate", demoInvestigation.id)).toBe(true); expect(isAllowed(leadAuth, "security.manage_users")).toBe(false); expect(isAllowed(auditorAuth, "investigation.read", demoInvestigation.id)).toBe(false); expect(isAllowed(adminAuth, "security.manage_users")).toBe(true);
    seeded.security.close(); seeded.repo.close(); seeded.temp.cleanup();
  });

  it("expires, revokes, and rate-limits sessions without exposing credentials", async () => {
    const temp = tempRoot(); let current = "2026-05-01T12:00:00.000Z"; const security = openSecurityStore({ filename: temp.db, now: () => current }); const user = security.createUser({ username: "session.user", displayName: "Session User", role: "investigator", passwordHash: await hashPassword("correct horse battery staple") }); const created = security.createSession(user.id, 1); expect(security.getSessionByToken(created.token)).not.toBeNull(); current = "2026-05-01T12:02:00.000Z"; expect(security.getSessionByToken(created.token)).toBeNull(); const fresh = security.createSession(user.id); security.revokeSession(fresh.session.id, user.id); expect(security.getSessionByToken(fresh.token)).toBeNull(); for (let index = 0; index < 6; index += 1) security.rateLimit("local:session.user"); expect(security.rateLimit("local:session.user").allowed).toBe(false); security.close(); temp.cleanup();
  });

  it("publishes and verifies an independently stored checkpoint, then detects ledger replacement", async () => {
    const seeded = await seed(); const provider = new LocalFileKeyProvider(seeded.temp.keys); const key = provider.rotate(seeded.security, seeded.user.id, undefined, now()); const anchorStore = new FileAnchorStore(seeded.temp.anchors, seeded.repo.filename); const checkpoint = createCheckpoint(seeded.repo, seeded.security, demoInvestigation.id, seeded.user.id, provider, anchorStore, key.keyId, now()); expect(checkpoint.anchorPath.startsWith(seeded.temp.anchors)).toBe(true); expect(verifyAgainstAnchor(seeded.repo, seeded.security, demoInvestigation.id, anchorStore).status).toBe("externally_anchored"); seeded.repo.rawForTests().prepare("UPDATE audit_events SET payload_json = ? WHERE investigation_id = ? AND sequence = ?").run(JSON.stringify({ replaced: true }), demoInvestigation.id, checkpoint.checkpointSequence); expect(verifyAgainstAnchor(seeded.repo, seeded.security, demoInvestigation.id, anchorStore).status).toBe("anchor_mismatch"); seeded.security.close(); seeded.repo.close(); seeded.temp.cleanup();
  });

  it("rotates trusted keys while preserving verification of historical checkpoints", async () => {
    const seeded = await seed(); const provider = new LocalFileKeyProvider(seeded.temp.keys); const first = provider.rotate(seeded.security, seeded.user.id, undefined, now()); const anchorStore = new FileAnchorStore(seeded.temp.anchors, seeded.repo.filename); const checkpoint = createCheckpoint(seeded.repo, seeded.security, demoInvestigation.id, seeded.user.id, provider, anchorStore, first.keyId, now()); const second = provider.rotate(seeded.security, seeded.user.id, first.keyId, now()); expect(seeded.security.getKey(first.keyId)?.status).toBe("revoked"); expect(verifyAgainstAnchor(seeded.repo, seeded.security, demoInvestigation.id, anchorStore).valid).toBe(true); expect(second.keyId).not.toBe(first.keyId); expect(checkpoint.keyId).toBe(first.keyId); seeded.security.close(); seeded.repo.close(); seeded.temp.cleanup();
  });

  it("encrypts, rejects tampered/wrong-key backups, and restores to a clean target", async () => {
    const seeded = await seed(); seeded.repo.close(); seeded.security.close(); const backup = createEncryptedBackup(seeded.temp.db, "a sufficiently long backup passphrase", now()); expect(() => decryptBackup(backup, "wrong passphrase that is long")).toThrow(); const corrupt = { ...backup, authTag: backup.authTag.slice(0, -2) + "aa" }; expect(() => decryptBackup(corrupt, "a sufficiently long backup passphrase")).toThrow(); const restored = path.join(seeded.temp.root, "restored", "investigation.sqlite"); const result = restoreEncryptedBackup(backup, "a sufficiently long backup passphrase", restored); expect(result.investigationIds).toContain(demoInvestigation.id); const recovered = openInvestigationRepository({ filename: restored, now }); expect(recovered.verifyIntegrity(demoInvestigation.id).valid).toBe(true); recovered.close(); seeded.temp.cleanup();
  });

  it("previews retention safely, honors legal hold, and preserves forensic history", async () => {
    const seeded = await seed(); seeded.security.saveRetentionPolicy(demoInvestigation.id, { retentionDays: 10, legalHold: false, backupRetentionDays: 30, exportRetentionDays: 30 }, seeded.user.id); const preview = previewRetention(seeded.repo, seeded.security, demoInvestigation.id, now()); expect(preview.status).toBe("eligible"); expect(preview.eligibleEvidenceIds.length).toBeGreaterThan(0); const applied = applyRetention(seeded.repo, seeded.security, demoInvestigation.id, seeded.user.id, "approval-123", now()); expect(applied.eligibleEvidenceIds).toEqual(preview.eligibleEvidenceIds); expect(seeded.security.retainedEvidenceIds(demoInvestigation.id)).toEqual(expect.arrayContaining(preview.eligibleEvidenceIds)); seeded.security.saveRetentionPolicy(demoInvestigation.id, { retentionDays: 10, legalHold: true, backupRetentionDays: 30, exportRetentionDays: 30 }, seeded.user.id); expect(previewRetention(seeded.repo, seeded.security, demoInvestigation.id, now()).status).toBe("hold_active"); seeded.security.close(); seeded.repo.close(); seeded.temp.cleanup();
  });
});
