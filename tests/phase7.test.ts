import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { hashCanonical } from "../lib/domain/canonical";
import { deriveHypothesisAssessments } from "../lib/domain/kernel";
import { replayDecisionPoint } from "../lib/domain/replay";
import { createInvestigationBranch, defaultDecisionAlternatives, evaluateDecisionAlternative } from "../lib/domain/replay";
import { buildForensicTimeline, compareHypothesisAssessments, historicalRows, validateGraphEdit, type GraphState } from "../lib/domain/workbench";
import { openInvestigationRepository } from "../lib/persistence/sqlite";
import type { Investigation } from "../lib/domain/types";

const clone = (): Investigation => JSON.parse(JSON.stringify(demoInvestigation)) as Investigation;
const graphOf = (investigation: Investigation): GraphState => ({ causalNodes: investigation.causalNodes, causalEdges: investigation.causalEdges, controls: investigation.controls });

describe("Phase 7 investigation workbench safeguards", () => {
  it("rejects graph cycles, duplicate identities, and unsupported established claims", () => {
    const investigation = clone(); const graph = graphOf(investigation);
    const cycle = { ...graph, causalEdges: [...graph.causalEdges, { ...graph.causalEdges[0], id: "edge-cycle", from: "node-2", to: "node-1" }] };
    expect(validateGraphEdit(investigation, cycle).issues.some((issue) => issue.code === "cycle")).toBe(true);
    const duplicate = { ...graph, causalNodes: [...graph.causalNodes, graph.causalNodes[0]] };
    expect(validateGraphEdit(investigation, duplicate).issues.some((issue) => issue.code === "duplicate_node")).toBe(true);
    const fabricated = { ...graph, causalEdges: [{ ...graph.causalEdges[0], causalStatus: "established" as const }] };
    expect(validateGraphEdit(investigation, fabricated).issues.some((issue) => issue.code === "unsupported_established_status")).toBe(true);
  });

  it("builds a six-clock forensic timeline and excludes later rows at a cutoff", () => {
    const rows = buildForensicTimeline(demoInvestigation);
    const event = rows.find((row) => row.id === "evt-004");
    expect(event?.clocks).toMatchObject({ occurrence: expect.any(String), detection: expect.any(String), ingestion: expect.any(String), knowledge: expect.any(String) });
    expect(rows.some((row) => row.kind === "mutation")).toBe(true);
    expect(historicalRows(demoInvestigation, replayDecisionPoint(demoInvestigation, "decision-evt-006").knowledgeCutoff).some((row) => row.id === "evt-007")).toBe(false);
  });

  it("compares competing hypotheses without probability conversion", () => {
    const comparison = compareHypothesisAssessments(deriveHypothesisAssessments(demoInvestigation), ["edge-1", "edge-3"]);
    expect(comparison.hypothesisIds).toEqual(["edge-1", "edge-3"]);
    expect(comparison.sharedSupportingEvidenceIds).toEqual([]);
    expect(comparison.unresolvedMissingEvidenceIds).toContain("missing-independent-device-validation");
  });

  it("records graph revisions as immutable audited versions and rejects stale parents", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "causal-proof-phase7-")); const filename = path.join(root, "case.sqlite"); const repo = openInvestigationRepository({ filename, now: () => "2026-04-08T12:00:00.000Z" }); repo.createInvestigation(clone());
    const first = repo.listGraphVersions(demoInvestigation.id).at(-1)!; const next = { ...graphOf(demoInvestigation), causalNodes: [...demoInvestigation.causalNodes, { id: "node-phase7", label: "Analyst review", kind: "intervention" as const, temporalAnchor: null }] };
    repo.saveGraphRevision(demoInvestigation.id, next, "tester", "phase 7 test"); expect(repo.listGraphVersions(demoInvestigation.id).length).toBeGreaterThan(1);
    expect(repo.ledger(demoInvestigation.id).some((event) => event.eventType === "graph.versioned")).toBe(true);
    expect(() => repo.saveGraphRevision("INV-OTHER", next)).toThrow(); expect(hashCanonical(first.graph)).toMatch(/^sha256:/); repo.close(); fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects forged replay, branch, and evidence integrity payloads", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "causal-proof-phase7-integrity-")); const filename = path.join(root, "case.sqlite"); const repo = openInvestigationRepository({ filename, now: () => "2026-04-08T12:00:00.000Z" }); repo.createInvestigation(clone());
    const replay = replayDecisionPoint(demoInvestigation, "decision-evt-006"); const forgedReplay = { ...replay, knowledgeCutoff: "2026-04-08T23:59:00+00:00" }; expect(() => repo.persistReplay(demoInvestigation.id, forgedReplay)).toThrow(/hash|snapshot/i);
    const alternative = defaultDecisionAlternatives(demoInvestigation, replay)[0]; const result = evaluateDecisionAlternative(demoInvestigation, replay, alternative, 11); const branch = createInvestigationBranch(demoInvestigation, replay, result); expect(() => repo.persistBranch(demoInvestigation.id, { ...branch, resultHash: "sha256:" + "0".repeat(64) }, result.simulation)).toThrow(/provenance|hash/i);
    const tampered = clone(); tampered.evidence[0].payload.relation = "fabricated"; expect(() => repo.saveInvestigation(tampered)).toThrow(/integrity hash/i); repo.close(); fs.rmSync(root, { recursive: true, force: true });
  });
});
