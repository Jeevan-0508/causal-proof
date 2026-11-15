import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { changeEvidenceStatus } from "../lib/domain/kernel";
import { replayDecisionPoint, createInvestigationBranch, defaultDecisionAlternatives, evaluateDecisionAlternative, snapshotAtDecision } from "../lib/domain/replay";
import { exportInvestigationPackage, importInvestigationPackage, verifyInvestigationPackage } from "../lib/persistence/package";
import { createEd25519Signer, createForensicReceipt, verifyForensicReceipt } from "../lib/persistence/signing";
import { openInvestigationRepository } from "../lib/persistence/sqlite";
import type { Investigation } from "../lib/domain/types";

const clone = (): Investigation => JSON.parse(JSON.stringify(demoInvestigation)) as Investigation;
function tempDb() { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "causal-proof-phase4-")); return { filename: path.join(directory, "investigation.sqlite"), cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) }; }
function fixedRepo(filename: string) { return openInvestigationRepository({ filename, now: () => "2026-04-08T12:00:00.000Z" }); }

describe("SQLite persistence and forensic integrity", () => {
  it("migrates, recovers after restart, and isolates investigations", () => {
    const temp = tempDb();
    const first = fixedRepo(temp.filename);
    expect(first.schemaVersion()).toBe(2);
    first.createInvestigation(clone());
    const second = clone(); second.id = "INV-OTHER"; second.title = "Isolated case"; first.createInvestigation(second);
    first.close();
    const restarted = fixedRepo(temp.filename);
    expect(restarted.loadInvestigation(demoInvestigation.id).events).toHaveLength(7);
    expect(restarted.listInvestigations()).toHaveLength(2);
    expect(restarted.ledger(demoInvestigation.id).every((event) => event.investigationId === demoInvestigation.id)).toBe(true);
    restarted.close(); temp.cleanup();
  });

  it("rolls back a failed transaction", () => {
    const temp = tempDb(); const repo = fixedRepo(temp.filename); repo.createInvestigation(clone());
    expect(() => repo.transaction(() => { repo.rawForTests().prepare("INSERT INTO evidence_records(investigation_id, evidence_id, record_json, available_at, status) VALUES (?, ?, ?, ?, ?)").run(demoInvestigation.id, "rollback", "{}", "2026-04-08T00:00:00Z", "active"); throw new Error("abort"); })).toThrow("abort");
    expect(repo.rawForTests().prepare("SELECT 1 FROM evidence_records WHERE evidence_id = ?").get("rollback")).toBeUndefined();
    repo.close(); temp.cleanup();
  });

  it("detects modified, removed, and reordered ledger events", () => {
    const temp = tempDb(); const repo = fixedRepo(temp.filename); repo.createInvestigation(clone()); repo.appendCustomEvent(demoInvestigation.id, "investigation.saved", { value: 1 }, "tester", "2026-04-08T12:01:00Z", "tamper-1"); repo.appendCustomEvent(demoInvestigation.id, "investigation.saved", { value: 2 }, "tester", "2026-04-08T12:02:00Z", "tamper-2");
    const db = repo.rawForTests();
    db.prepare("UPDATE audit_events SET payload_json = ? WHERE event_id = ?").run(JSON.stringify({ value: "changed" }), "tamper-1");
    expect(repo.verifyIntegrity(demoInvestigation.id).issues.some((issue) => issue.includes("Payload hash"))).toBe(true);
    db.prepare("DELETE FROM audit_events WHERE event_id = ?").run("tamper-2");
    expect(repo.verifyIntegrity(demoInvestigation.id).issues.some((issue) => issue.includes("count anchor"))).toBe(true);
    repo.close(); temp.cleanup();
  });

  it("reconstructs historical evidence without late mutation leakage", () => {
    const changed = changeEvidenceStatus(clone(), "evd-001", "challenge", "Late correction recorded after the decision.").investigation;
    const replay = replayDecisionPoint(changed, "decision-evt-006");
    const snapshot = snapshotAtDecision(changed, replay);
    expect(snapshot.evidence.find((record) => record.id === "evd-001")?.status).toBe("active");
    expect(snapshot.evidence.find((record) => record.id === "evd-001")?.history).toHaveLength(1);
    expect(replay.hindsightExcludedEvidenceIds).toContain("evd-002");
  });

  it("rejects backdated corrections", () => {
    const temp = tempDb(); const repo = fixedRepo(temp.filename); repo.createInvestigation(clone());
    const changed = changeEvidenceStatus(clone(), "evd-001", "challenge", "Correction").investigation;
    changed.evidence.find((record) => record.id === "evd-001")!.history[1].recordedAt = "2026-04-08T07:00:00+00:00";
    expect(() => repo.saveInvestigation(changed)).toThrow(/Backdated/);
    repo.close(); temp.cleanup();
  });

  it("does not let a late record rewrite an already persisted decision replay", () => {
    const temp = tempDb(); const repo = fixedRepo(temp.filename); repo.createInvestigation(clone());
    repo.persistReplay(demoInvestigation.id, replayDecisionPoint(demoInvestigation, "decision-evt-006"));
    const changed = changeEvidenceStatus(clone(), "evd-001", "challenge", "Attempted retroactive correction").investigation;
    changed.evidence.find((record) => record.id === "evd-001")!.history[1].recordedAt = "2026-04-08T10:20:00+00:00";
    expect(() => repo.saveInvestigation(changed)).toThrow(/persisted historical replay/);
    repo.close(); temp.cleanup();
  });

  it("persists immutable branches and replays across restart", () => {
    const temp = tempDb(); const repo = fixedRepo(temp.filename); repo.createInvestigation(clone());
    const replay = replayDecisionPoint(demoInvestigation, "decision-evt-006"); repo.persistReplay(demoInvestigation.id, replay);
    const result = evaluateDecisionAlternative(demoInvestigation, replay, defaultDecisionAlternatives(demoInvestigation, replay)[3], 77);
    const branch = createInvestigationBranch(demoInvestigation, replay, result); repo.persistBranch(demoInvestigation.id, branch, result.simulation); repo.close();
    const restarted = fixedRepo(temp.filename); expect(restarted.listBranches(demoInvestigation.id)[0]).toEqual(branch); expect(restarted.loadInvestigation(demoInvestigation.id).events).toHaveLength(7); restarted.close(); temp.cleanup();
  });

  it("round-trips a package and rejects malformed package content", () => {
    const source = tempDb(); const repo = fixedRepo(source.filename); repo.createInvestigation(clone());
    const pack = exportInvestigationPackage(repo, demoInvestigation.id, "2026-04-08T12:05:00.000Z");
    expect(verifyInvestigationPackage(pack).valid).toBe(true);
    const malformed = JSON.parse(JSON.stringify(pack)); malformed.investigation.title = "tampered"; expect(verifyInvestigationPackage(malformed).valid).toBe(false);
    const crossInvestigation = JSON.parse(JSON.stringify(pack)); crossInvestigation.auditEvents[0].investigationId = "INV-OTHER"; expect(verifyInvestigationPackage(crossInvestigation).valid).toBe(false);
    repo.close();
    const target = tempDb(); const imported = fixedRepo(target.filename); expect(importInvestigationPackage(imported, pack).id).toBe(demoInvestigation.id); expect(imported.verifyIntegrity(demoInvestigation.id).valid).toBe(true); imported.close(); source.cleanup(); target.cleanup();
  });

  it("supports optional Ed25519 receipts without embedding keys", () => {
    const pair = generateKeyPairSync("ed25519");
    const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    const signer = createEd25519Signer("test-key", privateKey, publicKey);
    const receipt = createForensicReceipt({ eventId: "evt-1", value: "synthetic" }, signer);
    expect(verifyForensicReceipt(receipt, signer.publicKey).valid).toBe(true);
    expect(verifyForensicReceipt({ ...receipt, payload: { eventId: "evt-1", value: "changed" } }, signer.publicKey).valid).toBe(false);
  });

  it("keeps concurrent local writers on the same SQLite file consistent", () => {
    const temp = tempDb(); const first = fixedRepo(temp.filename); first.createInvestigation(clone()); const second = fixedRepo(temp.filename);
    first.appendCustomEvent(demoInvestigation.id, "investigation.saved", { writer: 1 }, "writer-1", "2026-04-08T12:10:00Z", "writer-1");
    second.appendCustomEvent(demoInvestigation.id, "investigation.saved", { writer: 2 }, "writer-2", "2026-04-08T12:11:00Z", "writer-2");
    expect(first.verifyIntegrity(demoInvestigation.id).valid).toBe(true); first.close(); second.close(); temp.cleanup();
  });

  it("rejects a branch attached to another investigation", () => {
    const temp = tempDb(); const repo = fixedRepo(temp.filename); repo.createInvestigation(clone());
    const replay = replayDecisionPoint(demoInvestigation, "decision-evt-006"); const result = evaluateDecisionAlternative(demoInvestigation, replay, defaultDecisionAlternatives(demoInvestigation, replay)[0], 12); const branch = createInvestigationBranch(demoInvestigation, replay, result); branch.parentInvestigationId = "INV-OTHER";
    expect(() => repo.persistBranch(demoInvestigation.id, branch, result.simulation)).toThrow(/Cross-investigation/);
    repo.close(); temp.cleanup();
  });
});
