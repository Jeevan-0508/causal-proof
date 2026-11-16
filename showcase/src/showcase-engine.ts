import { demoInvestigation } from "../../lib/domain/demo";
import {
  assessHypothesis,
  changeEvidenceStatus,
  compareScenarios,
  deriveHypothesisAssessments,
  reconstructTimeline,
  runBaseline,
  validateCausalGraph,
} from "../../lib/domain/kernel";
import { historicalRows, compareHypothesisAssessments, buildForensicTimeline } from "../../lib/domain/workbench";
import { defaultDecisionAlternatives, evaluateDecisionAlternative, getDecisionPoints, replayDecisionPoint } from "../../lib/domain/replay";
import type {
  DecisionAlternative,
  DecisionAlternativeResult,
  EvidenceChange,
  Investigation,
  SimulationComparison,
} from "../../lib/domain/types";

export const SHOWCASE_VERSION = "phase-9.0";
export const PUBLIC_DATA_NOTICE = "Synthetic/local-only data. No backend, credentials, or private investigation data is included.";

export function createShowcaseInvestigation(): Investigation {
  return JSON.parse(JSON.stringify(demoInvestigation)) as Investigation;
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

export function decisionReplay(investigation: Investigation) {
  const point = getDecisionPoints(investigation)[0];
  return point ? replayDecisionPoint(investigation, point.id) : null;
}

export function runShowcaseSimulation(investigation: Investigation, controlId: string, seed: number, sensitivityBps: number): SimulationComparison {
  return controlId ? compareScenarios(investigation, controlId, seed, sensitivityBps) : { baseline: runBaseline(investigation, seed), intervention: runBaseline(investigation, seed), differenceCents: 0, sensitivityBps: 0 };
}

export function applyShowcaseEvidenceChange(investigation: Investigation, evidenceId: string, action: EvidenceChange["action"], reason: string): EvidenceChange {
  return changeEvidenceStatus(investigation, evidenceId, action, reason, "2026-04-08T12:45:00+00:00");
}

export function buildShowcaseSnapshot(investigation: Investigation, cutoff: string | null, selectedHypothesisIds: string[]) {
  const replay = decisionReplay(investigation);
  const assessments = deriveHypothesisAssessments(investigation);
  const timeline = cutoff ? historicalRows(investigation, cutoff) : buildForensicTimeline(investigation);
  return {
    chronology: reconstructTimeline(investigation.events),
    timeline,
    graphValidation: validateCausalGraph(investigation),
    assessments,
    comparison: compareHypothesisAssessments(assessments, selectedHypothesisIds),
    replay,
    alternatives: replay ? defaultDecisionAlternatives(investigation, replay) : [],
  };
}

export function runShowcaseAlternative(investigation: Investigation, alternative: DecisionAlternative, seed: number): DecisionAlternativeResult | null {
  const replay = decisionReplay(investigation);
  return replay ? evaluateDecisionAlternative(investigation, replay, alternative, seed) : null;
}

export function evidenceAssessment(investigation: Investigation, hypothesisId: string) {
  const edge = investigation.causalEdges.find((candidate) => candidate.id === hypothesisId);
  return edge ? assessHypothesis(investigation, edge) : null;
}
