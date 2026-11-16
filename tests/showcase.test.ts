import { describe, expect, it } from "vitest";
import { compareScenarios, deriveHypothesisAssessments } from "../lib/domain/kernel";
import { buildShowcaseSnapshot, createShowcaseInvestigation, runShowcaseSimulation } from "../showcase/src/showcase-engine";

describe("public showcase browser boundary", () => {
  it("uses the synthetic fixture and excludes later knowledge at the replay cutoff", () => {
    const investigation = createShowcaseInvestigation();
    const snapshot = buildShowcaseSnapshot(investigation, "2026-04-08T10:31:00+00:00", ["edge-1", "edge-2"]);
    expect(investigation.id).toBe("INV-2026-041");
    expect(snapshot.timeline.some((row) => row.id === "evt-007")).toBe(false);
    expect(snapshot.replay?.hindsightExcludedEventIds).toContain("evt-007");
  });

  it("keeps evidence challenges immutable and changes dependent assessment state", () => {
    const investigation = createShowcaseInvestigation();
    const before = deriveHypothesisAssessments(investigation).find((item) => item.hypothesisId === "edge-1");
    const next = { ...investigation, evidence: investigation.evidence.map((record) => record.id === "evd-001" ? { ...record, status: "withdrawn" as const, history: [...record.history, { id: "evd-001-1", evidenceId: "evd-001", kind: "withdrawn" as const, reason: "Test withdrawal.", recordedAt: "2026-04-08T12:45:00+00:00", previousStatus: "active" as const, nextStatus: "withdrawn" as const, originalIntegrityHash: record.originalIntegrityHash }] } : record) };
    const after = deriveHypothesisAssessments(next).find((item) => item.hypothesisId === "edge-1");
    expect(before?.activeSupportingEvidenceIds).toContain("evd-001");
    expect(after?.activeSupportingEvidenceIds).not.toContain("evd-001");
    expect(next.evidence.find((record) => record.id === "evd-001")?.history).toHaveLength(2);
  });

  it("reproduces fixed-seed scenarios and responds to explicit sensitivity changes", () => {
    const investigation = createShowcaseInvestigation();
    const first = runShowcaseSimulation(investigation, "control-realtime", 17, 700);
    const second = runShowcaseSimulation(investigation, "control-realtime", 17, 700);
    const sensitive = runShowcaseSimulation(investigation, "control-realtime", 17, 1500);
    expect(first).toEqual(second);
    expect(sensitive.intervention.input.controlParameters.sensitivityBps).toBe(1500);
    expect(sensitive.intervention.uncertaintyCents).not.toEqual(first.intervention.uncertaintyCents);
    expect(compareScenarios(investigation, "control-realtime", 17, 700).intervention.simulated).toBe(true);
  });
});
