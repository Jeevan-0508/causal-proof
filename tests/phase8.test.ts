import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { replayDecisionPoint } from "../lib/domain/replay";
import { exportInvestigationPackage, verifyInvestigationPackage } from "../lib/persistence/package";
import { openInvestigationRepository } from "../lib/persistence/sqlite";
import { buildAuthoritativeReport } from "../lib/report/authoritative";
import { assertDemoIsolation } from "../lib/security/demo-isolation";

const clone = () => JSON.parse(JSON.stringify(demoInvestigation));
function tempDb() { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "causal-proof-phase8-")); return { filename: path.join(directory, "demo.sqlite"), directory }; }

describe("Phase 8 forensic trust boundaries", () => {
  it("builds a server-authoritative historical report without later evidence", () => {
    const temp = tempDb(); const repo = openInvestigationRepository({ filename: temp.filename, now: () => "2026-04-08T12:00:00.000Z" }); repo.createInvestigation(clone());
    const replay = replayDecisionPoint(demoInvestigation, "decision-evt-006"); repo.persistReplay(demoInvestigation.id, replay);
    const report = buildAuthoritativeReport(repo, demoInvestigation.id, { decisionPointId: replay.decisionPoint.id, generatedAt: "2026-04-08T12:00:00.000Z" });
    expect(report.provenance.authoritative).toBe(true); expect(report.provenance.knowledgeCutoff).toBe(replay.knowledgeCutoff); expect(report.evidence.map((item) => item.id)).not.toContain("evd-002"); expect(report.canonicalPayloadHash).toMatch(/^sha256:/); expect(report.integrity.authenticity).toBe("unknown");
    repo.close(); fs.rmSync(temp.directory, { recursive: true, force: true });
  });

  it("rejects semantically inconsistent packages even after a manifest is recomputed", () => {
    const temp = tempDb(); const repo = openInvestigationRepository({ filename: temp.filename, now: () => "2026-04-08T12:00:00.000Z" }); repo.createInvestigation(clone()); const pack = exportInvestigationPackage(repo, demoInvestigation.id, "2026-04-08T12:05:00.000Z");
    const tampered = JSON.parse(JSON.stringify(pack)); tampered.replays.push({ replayId: "forged", investigationId: demoInvestigation.id, knownEventIds: ["missing"], knownEvidenceIds: [], generatedAlertIds: [], applicableControlIds: [], priorDecisionIds: [], unresolvedEvidenceIds: [], hindsightExcludedEventIds: [], hindsightExcludedEvidenceIds: [], knowledgeCutoff: "2026-04-08T10:00:00.000Z", historicalEvidenceMutationIds: [], snapshotHash: "sha256:" + "0".repeat(64), graphVersionHash: "sha256:" + "0".repeat(64), controlConfigurationHash: "sha256:" + "0".repeat(64), assumptions: ["forged"], replayHash: "sha256:" + "0".repeat(64) });
    tampered.integrityManifest.sectionHashes.replays = "sha256:" + "0".repeat(64); tampered.integrityManifest.manifestHash = "sha256:" + "0".repeat(64);
    const verification = verifyInvestigationPackage(tampered); expect(verification.valid).toBe(false); expect(verification.codes).toContain("REPLAY_HASH_MISMATCH"); expect(verification.codes).toContain("REPLAY_REFERENCE_INVALID");
    repo.close(); fs.rmSync(temp.directory, { recursive: true, force: true });
  });

  it("fails closed when synthetic demo paths are not explicit", () => {
    const before = { ...process.env }; delete process.env.CAUSAL_PROOF_DEMO_DB_PATH; delete process.env.CAUSAL_PROOF_DEMO_KEY_DIR; delete process.env.CAUSAL_PROOF_DEMO_ANCHOR_DIR; process.env.CAUSAL_PROOF_DEMO_MODE = "true";
    expect(() => assertDemoIsolation()).toThrow(/DEMO_ISOLATION_CONFIG_MISSING/); process.env = before;
  });
});
