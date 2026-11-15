import { randomUUID } from "node:crypto";
import { hashCanonical } from "../domain/canonical";
import { deriveHypothesisAssessments } from "../domain/kernel";
import { replayDecisionPoint, snapshotAtDecision } from "../domain/replay";
import type { HypothesisAssessment, Investigation, DecisionReplay, EvidenceRecord } from "../domain/types";
import { evidenceReference, findPromptInjection, promptInjectionFindings } from "./sanitize";
import type { CopilotAnswer, GroundedClaim, HypothesisComparison, NextInvestigativeAction } from "./types";

export type DeterministicAnswerOptions = {
  investigation: Investigation;
  question: string;
  runId?: string;
  generatedAt?: string;
  replay?: DecisionReplay;
};

function chronology(records: EvidenceRecord[], cutoff: string | null) {
  return { observedAt: records.map((record) => record.observedAt), availableAt: records.map((record) => record.availableAt), knowledgeCutoff: cutoff };
}

function references(records: EvidenceRecord[], ids: string[], investigationId: string, relation: "supporting" | "contradicting" | "context", rationale: string) {
  return ids.map((id) => records.find((record) => record.id === id)).filter((record): record is EvidenceRecord => Boolean(record)).map((record) => evidenceReference(record, investigationId, relation, rationale));
}

function claim(input: Omit<GroundedClaim, "claimId" | "investigationId" | "mode" | "provider" | "modelVersion"> & { claimId?: string; investigationId: string }): GroundedClaim {
  return { ...input, claimId: input.claimId ?? `claim-${hashCanonical(input).slice(7, 23)}`, mode: "deterministic", provider: "causal-proof-deterministic", modelVersion: "rules-1", investigationId: input.investigationId };
}

function comparison(assessment: HypothesisAssessment, investigation: Investigation): HypothesisComparison {
  const available = new Set(investigation.evidence.map((record) => record.id));
  return {
    hypothesisId: assessment.hypothesisId,
    label: investigation.causalEdges.find((edge) => edge.id === assessment.hypothesisId)?.label ?? assessment.hypothesisId,
    causalStatus: assessment.causalStatus,
    supportingEvidenceIds: assessment.activeSupportingEvidenceIds.filter((id) => available.has(id)),
    contradictingEvidenceIds: assessment.activeContradictingEvidenceIds.filter((id) => available.has(id)),
    missingEvidence: assessment.missingEvidenceIds,
    assumptions: assessment.assumptions,
    confounders: assessment.confounderNodeIds,
    identificationLimitations: assessment.warnings,
    humanReviewStatus: "not_reviewed",
  };
}

function recommendations(investigation: Investigation, assessments: HypothesisAssessment[], records: EvidenceRecord[], replay: DecisionReplay | undefined, injectionEvidence: EvidenceRecord[]): NextInvestigativeAction[] {
  const output: NextInvestigativeAction[] = [];
  const missing = [...new Set(assessments.flatMap((assessment) => assessment.missingEvidenceIds))];
  const support = [...new Set(assessments.flatMap((assessment) => assessment.activeSupportingEvidenceIds))];
  if (missing.length > 0) output.push({ actionId: `action-${hashCanonical({ kind: "missing", missing, support }).slice(7, 23)}`, investigationId: investigation.id, title: "Request the missing evidence", rationale: `The selected hypotheses identify unresolved evidence requirements: ${missing.join(", ")}.`, supportingEvidenceIds: support.filter((id) => records.some((record) => record.id === id)), expectedInformationValue: "high", risksAndLimitations: ["The missing record may not exist or may carry its own reliability concerns.", "This is a request for investigation, not an instruction to obtain data automatically."], authorizationPolicy: "Human investigator approval is required before requesting or collecting anything outside this workspace.", reviewStatus: "draft_suggestion", autonomousExecution: false });
  const contradictions = [...new Set(assessments.flatMap((assessment) => assessment.activeContradictingEvidenceIds))];
  if (contradictions.length > 0) output.push({ actionId: `action-${hashCanonical({ kind: "contradiction", contradictions }).slice(7, 23)}`, investigationId: investigation.id, title: "Review contradictory evidence", rationale: `Contradictory evidence is active for the selected hypotheses: ${contradictions.join(", ")}.`, supportingEvidenceIds: contradictions, expectedInformationValue: "high", risksAndLimitations: ["A contradiction may reflect scope, timing, source reliability, or a genuinely competing account.", "The engine does not resolve the contradiction without additional evidence."], authorizationPolicy: "The investigator may inspect authorized records; no external action is executed automatically.", reviewStatus: "draft_suggestion", autonomousExecution: false });
  if (replay) output.push({ actionId: `action-${hashCanonical({ kind: "replay", replayId: replay.replayId }).slice(7, 23)}`, investigationId: investigation.id, title: "Reconstruct the decision at the historical cutoff", rationale: `The selected decision has a preserved knowledge boundary at ${replay.knowledgeCutoff}.`, supportingEvidenceIds: replay.knownEvidenceIds.filter((id) => records.some((record) => record.id === id)), expectedInformationValue: "moderate", risksAndLimitations: ["The replay excludes later evidence and outcomes by design.", "Alternative results remain simulations and are not historical facts."], authorizationPolicy: "Historical replay is available only to authorized investigation members and requires explicit human review.", reviewStatus: "draft_suggestion", autonomousExecution: false });
  for (const evidence of injectionEvidence) output.push({ actionId: `action-${hashCanonical({ kind: "injection", evidenceId: evidence.id }).slice(7, 23)}`, investigationId: investigation.id, title: "Verify the source containing instruction-like text", rationale: `Evidence ${evidence.id} contains text that resembles an instruction rather than ordinary source content.`, supportingEvidenceIds: [evidence.id], expectedInformationValue: "moderate", risksAndLimitations: ["The deterministic detector is pattern-based and can produce false positives.", "The content is treated as untrusted data and is not executed."], authorizationPolicy: "A human investigator must validate the source before changing its status or relying on its interpretation.", reviewStatus: "draft_suggestion", autonomousExecution: false });
  if (output.length === 0) output.push({ actionId: `action-${hashCanonical({ kind: "review", investigationId: investigation.id }).slice(7, 23)}`, investigationId: investigation.id, title: "Review the evidence dependency map", rationale: "No high-priority missing or contradictory dependency was identified by the deterministic rules.", supportingEvidenceIds: records.slice(0, 3).map((record) => record.id), expectedInformationValue: "low", risksAndLimitations: ["A rule-based scan cannot establish that the evidence set is complete."], authorizationPolicy: "Human review remains required; no action is executed automatically.", reviewStatus: "draft_suggestion", autonomousExecution: false });
  return output;
}

export function generateDeterministicAnswer(options: DeterministicAnswerOptions): CopilotAnswer {
  const { investigation, question } = options;
  const replay = options.replay;
  const replaySnapshot = replay ? snapshotAtDecision(investigation, replay) : undefined;
  const replayGraphHash = replaySnapshot && replay ? hashCanonical({ causalNodes: replaySnapshot.causalNodes, causalEdges: replaySnapshot.causalEdges.map((edge) => ({ ...edge, supportingEvidenceIds: edge.supportingEvidenceIds.filter((id) => replay.knownEvidenceIds.includes(id)), contradictingEvidenceIds: edge.contradictingEvidenceIds.filter((id) => replay.knownEvidenceIds.includes(id)) })), controls: replaySnapshot.controls }) : null;
  const historicalGraphChanged = Boolean(replay && replayGraphHash !== replay.graphVersionHash);
  const scoped = replaySnapshot ? { ...replaySnapshot, causalEdges: historicalGraphChanged ? [] : replaySnapshot.causalEdges, controls: historicalGraphChanged ? [] : replaySnapshot.controls } : investigation;
  const records = scoped.evidence;
  const assessments = deriveHypothesisAssessments(scoped);
  const questionText = question.trim();
  const relevant = assessments.filter((assessment) => {
    const edge = scoped.causalEdges.find((candidate) => candidate.id === assessment.hypothesisId);
    const query = questionText.toLowerCase();
    return !query || query.includes(assessment.hypothesisId.toLowerCase()) || query.includes(edge?.label.toLowerCase() ?? "") || /hypothes|support|contradict|why|evidence|cause/i.test(query);
  });
  const selected = relevant.length > 0 ? relevant : assessments;
  const allReferenced = [...new Set(selected.flatMap((assessment) => [...assessment.activeSupportingEvidenceIds, ...assessment.activeContradictingEvidenceIds]))];
  const contextRecords = allReferenced.map((id) => records.find((record) => record.id === id)).filter((record): record is EvidenceRecord => Boolean(record));
  const injectionEvidence = records.filter((record) => findPromptInjection(record));
  const cutoff = replay?.knowledgeCutoff ?? null;
  const comparisons = selected.map((assessment) => comparison(assessment, scoped));
  const claims: GroundedClaim[] = [];
  if (contextRecords.length > 0) {
    claims.push(claim({ investigationId: investigation.id, text: `${contextRecords.length} authorized evidence record${contextRecords.length === 1 ? " is" : "s are"} relevant to this question.`, kind: "direct_observation", evidenceReferences: contextRecords.map((record) => evidenceReference(record, investigation.id, "context", "The record is included because it is an explicit dependency of the selected hypothesis.")), sourceIdentifiers: contextRecords.map((record) => record.source), chronology: chronology(contextRecords, cutoff), supportingRationale: "The count is derived from records present in the authorized investigation scope.", contradictingRationale: "The count does not resolve whether any record is authentic or causally sufficient.", missingContext: [], uncertainty: "Record presence is not proof of truth, completeness, or causation.", knowledgeCutoff: cutoff }));
  }
  for (const assessment of selected) {
    const edge = scoped.causalEdges.find((candidate) => candidate.id === assessment.hypothesisId)!;
    const supportRefs = references(records, assessment.activeSupportingEvidenceIds, investigation.id, "supporting", `Referenced by hypothesis ${edge.id}.`);
    const contradictionRefs = references(records, assessment.activeContradictingEvidenceIds, investigation.id, "contradicting", `Contradictory dependency for hypothesis ${edge.id}.`);
    const refs = [...supportRefs, ...contradictionRefs];
    claims.push(claim({ claimId: `claim-${hashCanonical({ edgeId: edge.id, refs: refs.map((reference) => reference.evidenceId), cutoff }).slice(7, 23)}`, investigationId: investigation.id, text: `${edge.label} is assessed as ${assessment.causalStatus}. This is an evidence dependency assessment, not a causal probability or proof.`, kind: "supported_hypothesis", evidenceReferences: refs.length > 0 ? refs : contextRecords.map((record) => evidenceReference(record, investigation.id, "context", `No direct dependency was available for hypothesis ${edge.id}; context is shown to make that limitation explicit.`)), sourceIdentifiers: [...new Set(refs.map((reference) => reference.source))], chronology: chronology(refs.length > 0 ? refs.map((reference) => records.find((record) => record.id === reference.evidenceId)!).filter(Boolean) : contextRecords, cutoff), supportingRationale: supportRefs.length > 0 ? `Supporting records: ${supportRefs.map((reference) => reference.evidenceId).join(", ")}.` : "No active supporting record was identified.", contradictingRationale: contradictionRefs.length > 0 ? `Contradictory records: ${contradictionRefs.map((reference) => reference.evidenceId).join(", ")}.` : "No active contradictory record was identified.", missingContext: assessment.missingEvidenceIds, uncertainty: [...assessment.warnings, "Observational evidence alone does not establish causation."].join(" "), knowledgeCutoff: cutoff }));
  }
  const recommendationsList = recommendations(scoped, selected, records, replay, injectionEvidence);
  const answer = replay ? `At the historical knowledge cutoff ${replay.knowledgeCutoff}, the deterministic copilot found ${claims.length} grounded claim${claims.length === 1 ? "" : "s"}. Later evidence and outcomes are excluded.${historicalGraphChanged ? " The current graph or control configuration differs from the replay hash, so causal comparisons are withheld." : ""}` : `The deterministic copilot found ${claims.length} grounded claim${claims.length === 1 ? "" : "s"} from the authorized evidence dependencies. It does not infer causal certainty.`;
  const inputHash = hashCanonical({ investigationId: investigation.id, question: questionText, replayHash: replay?.replayHash ?? null, evidence: records.map((record) => ({ id: record.id, status: record.status, integrityHash: record.integrityHash })), hypotheses: selected.map((assessment) => ({ id: assessment.hypothesisId, status: assessment.causalStatus })) });
  return { runId: options.runId ?? `run-${randomUUID()}`, investigationId: investigation.id, question: questionText, answer, claims, hypotheses: comparisons, recommendations: recommendationsList, promptInjectionFlags: promptInjectionFindings(scoped).map((finding) => `${finding.evidenceId}: ${finding.finding}`), mode: "deterministic", provider: "causal-proof-deterministic", modelVersion: "rules-1", knowledgeCutoff: cutoff, replayId: replay?.replayId ?? null, replayHash: replay?.replayHash ?? null, inputHash, generatedAt: options.generatedAt ?? new Date().toISOString() };
}

export function deterministicHistoricalAnswer(investigation: Investigation, question: string, decisionPointId: string, options: Omit<DeterministicAnswerOptions, "investigation" | "question" | "replay"> = {}): CopilotAnswer {
  return generateDeterministicAnswer({ investigation, question, replay: replayDecisionPoint(investigation, decisionPointId), ...options });
}
