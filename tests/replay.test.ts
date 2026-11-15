import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { exportReport } from "../lib/domain/kernel";
import { analyzeDecisionQuality, createInvestigationBranch, defaultDecisionAlternatives, evaluateDecisionAlternative, getDecisionPoints, replayDecisionPoint } from "../lib/domain/replay";
import type { Investigation } from "../lib/domain/types";

const clone = (): Investigation => JSON.parse(JSON.stringify(demoInvestigation)) as Investigation;

describe("decision replay engine", () => {
  it("enforces a knowledge cutoff and excludes later evidence", () => {
    const point = getDecisionPoints(demoInvestigation)[0];
    const replay = replayDecisionPoint(demoInvestigation, point.id);
    expect(replay.knownEventIds).toContain("evt-006");
    expect(replay.hindsightExcludedEventIds).toContain("evt-007");
    expect(replay.knownEvidenceIds).toEqual(["evd-001", "evd-003"]);
    expect(replay.hindsightExcludedEvidenceIds).toEqual(["evd-002", "evd-004"]);
    expect(replay.assumptions.join(" ")).toContain("hindsight");
  });

  it("rejects a decision whose knowledge timestamp precedes its occurrence", () => {
    const invalid = clone();
    invalid.events.find((event) => event.id === "evt-006")!.knowledgeAt = "2026-04-08T10:00:00+00:00";
    expect(() => replayDecisionPoint(invalid, "decision-evt-006")).toThrow(/knowledge time/);
  });

  it("replays alternatives deterministically against the decision-time snapshot", () => {
    const replay = replayDecisionPoint(demoInvestigation, "decision-evt-006");
    const alternatives = defaultDecisionAlternatives(demoInvestigation, replay);
    const first = evaluateDecisionAlternative(demoInvestigation, replay, alternatives[0], 77);
    const second = evaluateDecisionAlternative(demoInvestigation, replay, alternatives[0], 77);
    expect(first).toEqual(second);
    expect(first.simulation.baselineLossCents).toBe(8000000);
    expect(first.historicalFact).toBe(false);
  });

  it("creates an isolated branch with reproducibility metadata", () => {
    const replay = replayDecisionPoint(demoInvestigation, "decision-evt-006");
    const alternative = defaultDecisionAlternatives(demoInvestigation, replay)[3];
    const result = evaluateDecisionAlternative(demoInvestigation, replay, alternative, 20261114);
    const branch = createInvestigationBranch(demoInvestigation, replay, result);
    expect(branch.parentInvestigationId).toBe(demoInvestigation.id);
    expect(branch.availableEventIds).not.toContain("evt-007");
    expect(branch.immutableParent).toBe(true);
    expect(branch.simulationInputHash).toBe(result.simulation.input.inputHash);
    expect(demoInvestigation.events).toHaveLength(7);
  });

  it("produces structured decision-quality observations without a score", () => {
    const replay = replayDecisionPoint(demoInvestigation, "decision-evt-006");
    const quality = analyzeDecisionQuality(demoInvestigation, replay);
    expect(quality.scored).toBe(false);
    expect(quality.evidenceLimitations.some((item) => item.includes("evd-002"))).toBe(true);
    const report = exportReport(demoInvestigation, undefined, "2026-04-08T12:00:00+00:00", { replays: [replay], alternativeResults: [], branches: [], decisionQuality: [quality] });
    expect(report.replay?.replays[0].replayHash).toBe(replay.replayHash);
  });
});
