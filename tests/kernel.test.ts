import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { hashEvidencePayload } from "../lib/domain/canonical";
import { affectedHypotheses, changeEvidenceStatus, compareScenarios, deriveHypothesisAssessments, reconstructTimeline, runCounterfactual, validateCausalGraph } from "../lib/domain/kernel";
import type { Investigation } from "../lib/domain/types";

const clone = (): Investigation => JSON.parse(JSON.stringify(demoInvestigation)) as Investigation;

describe("scientific integrity kernel", () => {
  it("reconstructs event time while retaining ingestion lag and timestamp conflicts", () => {
    const events = clone().events;
    events[0].ingestedAt = "2026-04-08T08:01:00+00:00";
    const timeline = reconstructTimeline(events);
    expect(timeline.find((item) => item.id === "evt-001")?.flags).toContain("timestamp_conflict");
    expect(timeline.find((item) => item.id === "evt-004")?.ingestionLagMinutes).toBe(109);
    expect(timeline.find((item) => item.id === "evt-005")?.flags).toContain("missing_context");
  });

  it("rejects cycles and temporal inversions in causal graphs", () => {
    const cyclic = clone();
    cyclic.causalEdges.push({ ...cyclic.causalEdges[0], id: "edge-cycle", from: "node-2", to: "node-1" });
    expect(validateCausalGraph(cyclic).issues.some((issue) => issue.code === "cycle")).toBe(true);
    const temporal = clone();
    temporal.causalNodes[0].temporalAnchor = "2026-04-08T09:00:00+00:00";
    temporal.causalNodes[1].temporalAnchor = "2026-04-08T08:00:00+00:00";
    expect(validateCausalGraph(temporal).issues.some((issue) => issue.code === "temporal_order")).toBe(true);
  });

  it("tracks dependencies and recomputes a hypothesis after challenge and restore", () => {
    const before = deriveHypothesisAssessments(demoInvestigation).find((item) => item.hypothesisId === "edge-1");
    const challenged = changeEvidenceStatus(demoInvestigation, "evd-001", "challenge", "Beneficiary identity is not independently verified.");
    const afterChallenge = challenged.after.find((item) => item.hypothesisId === "edge-1");
    expect(before?.causalStatus).toBe("plausible");
    expect(afterChallenge?.causalStatus).toBe("unidentifiable");
    expect(challenged.investigation.evidence[0].history).toHaveLength(2);
    const restored = changeEvidenceStatus(challenged.investigation, "evd-001", "restore", "Ledger source rechecked against the retained hash.");
    expect(restored.after.find((item) => item.hypothesisId === "edge-1")?.causalStatus).toBe("plausible");
    expect(restored.investigation.evidence[0].history).toHaveLength(3);
  });

  it("preserves contradictory evidence and surfaces it when active", () => {
    const restored = changeEvidenceStatus(demoInvestigation, "evd-002", "restore", "Restore for contradiction review.").investigation;
    const edge = deriveHypothesisAssessments(restored).find((item) => item.hypothesisId === "edge-3");
    expect(edge?.contradictingEvidenceIds).toContain("evd-002");
    expect(edge?.activeContradictingEvidenceIds).toContain("evd-002");
    expect(edge?.warnings.some((warning) => warning.includes("contradictory"))).toBe(true);
  });

  it("maps changed evidence to dependent hypotheses", () => {
    expect(affectedHypotheses(demoInvestigation, demoInvestigation.evidence[1])).toEqual(["edge-2", "edge-3"]);
  });

  it("replays the same simulation and changes output for sensitivity", () => {
    const first = compareScenarios(demoInvestigation, "control-realtime", 77, 700);
    const second = compareScenarios(demoInvestigation, "control-realtime", 77, 700);
    const wider = runCounterfactual(demoInvestigation, "control-realtime", 77, 1700);
    expect(first).toEqual(second);
    expect(first.intervention.input.inputHash).toBe(second.intervention.input.inputHash);
    expect(wider.uncertaintyCents.high - wider.uncertaintyCents.low).toBeGreaterThan(first.intervention.uncertaintyCents.high - first.intervention.uncertaintyCents.low);
    expect(first.baseline.lossCents).toBe(24000000);
  });

  it("does not establish causation from observational evidence", () => {
    const assessments = deriveHypothesisAssessments(demoInvestigation);
    expect(assessments.every((assessment) => assessment.causalStatus !== "established")).toBe(true);
    expect(assessments.find((assessment) => assessment.hypothesisId === "edge-1")?.warnings[0]).toContain("Observational");
  });

  it("rejects invalid model assumptions before simulation", () => {
    expect(() => runCounterfactual(demoInvestigation, "control-realtime", 77, -1)).toThrow(/Sensitivity/);
    const invalid = clone();
    invalid.causalEdges[1].evidenceMode = "interventional";
    expect(validateCausalGraph(invalid).issues.some((issue) => issue.code === "interventional_evidence_missing")).toBe(true);
  });

  it("hashes nested canonical evidence payloads consistently", () => {
    expect(hashEvidencePayload({ b: "2", a: "1" })).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashEvidencePayload({ a: "1", b: "2" })).toBe(hashEvidencePayload({ b: "2", a: "1" }));
  });
});
