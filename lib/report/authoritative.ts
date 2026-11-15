import { hashCanonical } from "../domain/canonical";
import { reconstructEvidenceAt } from "../domain/historical";
import { exportReport } from "../domain/kernel";
import { analyzeDecisionQuality, replayDecisionPoint, snapshotAtDecision } from "../domain/replay";
import { buildForensicTimeline, graphHash, validateGraphEdit, type GraphState } from "../domain/workbench";
import type { DecisionReplay, Investigation, ReplayReportContext } from "../domain/types";
import type { InvestigationRepository } from "../persistence/sqlite";
import { assertNoSecrets } from "../persistence/package";

export type AuthoritativeReportOptions = { decisionPointId?: string; generatedAt?: string };

export type AuthoritativeReport = ReturnType<typeof exportReport> & {
  reportVersion: "0.3";
  canonicalPayloadHash: string;
  provenance: {
    authoritative: true;
    source: "persisted-sqlite";
    investigationHash: string;
    generatedAt: string;
    knowledgeCutoff: string;
    decisionPointId: string | null;
    graphVersion: number | null;
    graphHash: string;
    excludedLaterArtifactIds: string[];
  };
  integrity: {
    ledgerStatus: string;
    ledgerHeadHash: string | null;
    issues: string[];
    packageConsistency: "consistent" | "inconsistent";
    authenticity: "unknown";
  };
  hypothesisComparison: {
    hypothesisIds: string[];
    activeEvidenceByHypothesis: Record<string, { supporting: string[]; contradicting: string[] }>;
    unresolvedEvidenceIds: string[];
  };
  copilot: { runs: unknown[]; reviews: unknown[]; warning: string };
  limitations: string[];
};

const knowledgeTime = (event: Investigation["events"][number]) => event.knowledgeAt ?? event.detectedAt ?? event.ingestedAt;

function latestCutoff(investigation: Investigation): string {
  return investigation.events.map(knowledgeTime).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? investigation.events[0]?.ingestedAt ?? new Date(0).toISOString();
}

function historicalGraph(repo: InvestigationRepository, investigationId: string, cutoff: string): { version: number | null; graph: GraphState; graphHash: string } {
  const versions = repo.listGraphVersions(investigationId).filter((version) => Date.parse(version.createdAt) <= Date.parse(cutoff));
  const allVersions = repo.listGraphVersions(investigationId);
  const selected = versions.at(-1) ?? allVersions[0];
  const graph = (selected?.graph ?? { causalNodes: [], causalEdges: [], controls: [] }) as GraphState;
  return { version: selected?.version ?? null, graph, graphHash: selected?.graphHash ?? graphHash(graph) };
}

function replayContextAtCutoff(repo: InvestigationRepository, investigation: Investigation, cutoff: string, selectedReplay: DecisionReplay | undefined): ReplayReportContext {
  const replays = repo.listReplays(investigation.id).filter((item) => Date.parse(item.knowledgeCutoff) <= Date.parse(cutoff));
  const selected = selectedReplay && Date.parse(selectedReplay.knowledgeCutoff) <= Date.parse(cutoff) ? selectedReplay : undefined;
  const replayIds = new Set(replays.map((item) => item.replayId));
  const branches = repo.listBranches(investigation.id).filter((item) => Date.parse(item.forkedAt) <= Date.parse(cutoff));
  const simulations = repo.listSimulations(investigation.id).filter((item) => !selected || item.input.scenarioId === investigation.id);
  const alternativeResults = branches.flatMap((branch) => {
    const simulation = simulations.find((item) => item.input.inputHash === branch.simulationInputHash) ?? repo.listSimulations(investigation.id).find((item) => item.input.inputHash === branch.simulationInputHash);
    if (!simulation) return [];
    return [{
    alternative: { id: branch.chosenAlternativeId, kind: branch.chosenAction, label: branch.chosenAction, description: "Persisted historical branch alternative.", ...(branch.controlId ? { controlId: branch.controlId } : {}), assumptions: ["Reconstructed from the persisted branch record."] },
    replayId: branch.forkDecisionPointId,
    simulation,
    feasible: true,
    feasibilityReasons: ["Persisted branch record is available at the selected cutoff."],
    historicalFact: false as const,
    resultHash: branch.resultHash,
    }];
  });
  const decisionQuality = selected ? [analyzeDecisionQuality(investigation, selected)] : [];
  return { replays: selected ? [...replays.filter((item) => item.replayId !== selected.replayId), selected] : replays, alternativeResults, branches, decisionQuality };
}

function canonicalReportInput(report: Omit<AuthoritativeReport, "generatedAt" | "canonicalPayloadHash" | "provenance" | "integrity">, provenance: AuthoritativeReport["provenance"], integrity: AuthoritativeReport["integrity"]): unknown {
  return { reportVersion: report.reportVersion, investigationId: report.investigationId, title: report.title, chronology: report.chronology, evidence: report.evidence, causalHypotheses: report.causalHypotheses, graphValidation: report.graphValidation, simulation: report.simulation, replay: report.replay, hypothesisComparison: report.hypothesisComparison, copilot: report.copilot, limitations: report.limitations, knowledgeCutoff: provenance.knowledgeCutoff, graphVersion: provenance.graphVersion, graphHash: provenance.graphHash, ledgerHeadHash: integrity.ledgerHeadHash };
}

export function buildAuthoritativeReport(repo: InvestigationRepository, investigationId: string, options: AuthoritativeReportOptions = {}): AuthoritativeReport {
  const stored = repo.loadInvestigation(investigationId);
  assertNoSecrets(stored, "investigation");
  const integrity = repo.verifyIntegrity(investigationId);
  if (!integrity.valid) throw new Error(`REPORT_INTEGRITY_FAILURE: ${integrity.issues.join(" ")}`);
  const selectedReplay = options.decisionPointId ? replayDecisionPoint(stored, options.decisionPointId) : undefined;
  const cutoff = selectedReplay?.knowledgeCutoff ?? latestCutoff(stored);
  const graph = historicalGraph(repo, investigationId, cutoff);
  const historicalEvidence = reconstructEvidenceAt(stored, cutoff);
  const events = stored.events.filter((event) => Date.parse(knowledgeTime(event)) <= Date.parse(cutoff));
  const historical: Investigation = { ...stored, events, evidence: historicalEvidence, ...graph.graph };
  const replayContext = replayContextAtCutoff(repo, stored, cutoff, selectedReplay);
  const base = exportReport(historical, replayContext.alternativeResults[0]?.simulation, options.generatedAt ?? new Date().toISOString(), replayContext);
  const causalHypotheses = base.causalHypotheses;
  const packageConsistency = validateGraphEdit(stored, graph.graph).valid && stored.evidence.every((record) => record.history.at(-1)?.nextStatus === record.status) ? "consistent" : "inconsistent";
  const activeEvidenceByHypothesis = Object.fromEntries(causalHypotheses.map((item) => [item.hypothesisId, { supporting: item.activeSupportingEvidenceIds, contradicting: item.activeContradictingEvidenceIds }]));
  const provenance: AuthoritativeReport["provenance"] = { authoritative: true, source: "persisted-sqlite", investigationHash: hashCanonical(stored), generatedAt: base.generatedAt, knowledgeCutoff: cutoff, decisionPointId: selectedReplay?.decisionPoint.id ?? null, graphVersion: graph.version, graphHash: graph.graphHash, excludedLaterArtifactIds: [...repo.listReplays(investigationId).filter((item) => Date.parse(item.knowledgeCutoff) > Date.parse(cutoff)).map((item) => item.replayId), ...repo.listBranches(investigationId).filter((item) => Date.parse(item.forkedAt) > Date.parse(cutoff)).map((item) => item.id)] };
  const copilotRuns = repo.listCopilotRuns(investigationId).filter((item) => item.knowledgeCutoff === null || Date.parse(item.knowledgeCutoff) <= Date.parse(cutoff));
  const copilotReviews = repo.listCopilotReviews(investigationId).filter((item) => Date.parse(item.reviewedAt) <= Date.parse(cutoff));
  const reportWithoutVolatile = { ...base, reportVersion: "0.3" as const, causalHypotheses, limitations: [...base.limitations, "This report is authoritative only for the persisted local records and selected historical cutoff.", "Integrity consistency does not establish authenticity or source truth."], hypothesisComparison: { hypothesisIds: causalHypotheses.map((item) => item.hypothesisId), activeEvidenceByHypothesis, unresolvedEvidenceIds: [...new Set(causalHypotheses.flatMap((item) => item.missingEvidenceIds))] }, copilot: { runs: copilotRuns, reviews: copilotReviews, warning: "Copilot output is advisory, citation-constrained, and subject to human review; it is not an independent source of truth." } };
  const integritySummary: AuthoritativeReport["integrity"] = { ledgerStatus: integrity.status, ledgerHeadHash: integrity.headHash, issues: integrity.issues, packageConsistency, authenticity: "unknown" };
  const canonicalPayloadHash = hashCanonical(canonicalReportInput(reportWithoutVolatile as Omit<AuthoritativeReport, "generatedAt" | "canonicalPayloadHash" | "provenance" | "integrity">, provenance, integritySummary));
  return { ...reportWithoutVolatile, canonicalPayloadHash, provenance, integrity: integritySummary };
}

export function reportTimelineAtCutoff(investigation: Investigation, cutoff: string) { return buildForensicTimeline(investigation, cutoff); }
