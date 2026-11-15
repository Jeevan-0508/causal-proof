import { hashCanonical } from "./canonical";
import { historicalMutationIds, reconstructEvidenceAt } from "./historical";
import { runBaseline, runCounterfactual } from "./kernel";
import type {
  AlternativeActionKind,
  DecisionAlternative,
  DecisionAlternativeResult,
  DecisionPoint,
  DecisionQualityAnalysis,
  DecisionReplay,
  Investigation,
  InvestigationBranch,
} from "./types";

const knowledgeTime = (event: Investigation["events"][number]) => event.knowledgeAt ?? event.detectedAt ?? event.ingestedAt;

export function getDecisionPoints(investigation: Investigation): DecisionPoint[] {
  return investigation.events
    .filter((event) => event.kind === "decision")
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .map((event) => ({ id: `decision-${event.id}`, eventId: event.id, decidedAt: event.occurredAt, actorId: event.actorId, accountId: event.accountId, summary: event.summary }));
}

export function replayDecisionPoint(investigation: Investigation, decisionPointId: string): DecisionReplay {
  const decisionPoint = getDecisionPoints(investigation).find((point) => point.id === decisionPointId);
  if (!decisionPoint) throw new Error(`Unknown decision point: ${decisionPointId}`);
  const decisionEvent = investigation.events.find((event) => event.id === decisionPoint.eventId);
  if (!decisionEvent) throw new Error(`Decision event ${decisionPoint.eventId} is missing.`);
  const cutoff = Date.parse(knowledgeTime(decisionEvent));
  const decisionKnowledgeAt = Date.parse(knowledgeTime(decisionEvent));
  if (decisionKnowledgeAt < Date.parse(decisionPoint.decidedAt)) throw new Error("Invalid decision timestamp: knowledge time precedes decision occurrence time.");
  const knownEventIds = investigation.events.filter((event) => event.id === decisionPoint.eventId || Date.parse(knowledgeTime(event)) <= cutoff).map((event) => event.id);
  const knownEventSet = new Set(knownEventIds);
  const historicalEvidence = reconstructEvidenceAt(investigation, knowledgeTime(decisionEvent));
  const knownEvidenceIds = historicalEvidence.map((record) => record.id);
  const knownEvidenceSet = new Set(knownEvidenceIds);
  const priorDecisionIds = getDecisionPoints(investigation).filter((point) => point.id !== decisionPointId && Date.parse(point.decidedAt) < cutoff).map((point) => point.id);
  const generatedAlertIds = investigation.events.filter((event) => event.kind === "alert" && knownEventSet.has(event.id)).map((event) => event.id);
  const applicableControlIds = investigation.controls.filter((control) => control.targetsHypothesisIds.some((hypothesisId) => {
    const hypothesis = investigation.causalEdges.find((edge) => edge.id === hypothesisId);
    return hypothesis?.supportingEvidenceIds.some((evidenceId) => knownEvidenceSet.has(evidenceId));
  })).map((control) => control.id);
  const hindsightExcludedEventIds = investigation.events.filter((event) => !knownEventSet.has(event.id)).map((event) => event.id);
  const hindsightExcludedEvidenceIds = investigation.evidence.filter((record) => !knownEvidenceSet.has(record.id)).map((record) => record.id);
  const graphVersionHash = hashCanonical({ causalNodes: investigation.causalNodes, causalEdges: investigation.causalEdges.map((edge) => ({ ...edge, supportingEvidenceIds: edge.supportingEvidenceIds.filter((id) => knownEvidenceSet.has(id)), contradictingEvidenceIds: edge.contradictingEvidenceIds.filter((id) => knownEvidenceSet.has(id)) })), controls: investigation.controls });
  const controlConfigurationHash = hashCanonical(investigation.controls.filter((control) => applicableControlIds.includes(control.id)));
  const snapshotHash = hashCanonical({ knownEventIds, historicalEvidence, graphVersionHash, controlConfigurationHash });
  const unresolvedEvidenceIds = [...new Set([
    ...hindsightExcludedEvidenceIds,
    ...investigation.causalEdges.flatMap((edge) => edge.missingEvidenceIds),
  ])];
  const assumptions = [
    "Knowledge time is the boundary; occurrence time alone does not make a record knowable.",
    "Evidence discovered after the decision is excluded from the replay snapshot to prevent hindsight leakage.",
    "Evidence status is reconstructed from mutations recorded by the cutoff; later challenges and restorations are excluded.",
    "The graph and controls are represented by hashes so a later version cannot silently replace the recorded replay inputs.",
    "Alternative outcomes remain simulations and are not historical facts.",
  ];
  const replayWithoutHash = { investigationId: investigation.id, decisionPoint, knownEventIds, knownEvidenceIds, generatedAlertIds, applicableControlIds, priorDecisionIds, unresolvedEvidenceIds, hindsightExcludedEventIds, hindsightExcludedEvidenceIds, knowledgeCutoff: knowledgeTime(decisionEvent), historicalEvidenceMutationIds: historicalMutationIds(investigation, knowledgeTime(decisionEvent)), snapshotHash, graphVersionHash, controlConfigurationHash, assumptions };
  return { replayId: `replay-${hashCanonical(replayWithoutHash).slice(7, 23)}`, ...replayWithoutHash, replayHash: hashCanonical(replayWithoutHash) };
}

export function snapshotAtDecision(investigation: Investigation, replay: DecisionReplay): Investigation {
  const eventSet = new Set(replay.knownEventIds);
  const evidenceSet = new Set(replay.knownEvidenceIds);
  const evidenceById = new Map(reconstructEvidenceAt(investigation, replay.knowledgeCutoff).map((record) => [record.id, record]));
  return {
    ...investigation,
    events: investigation.events.filter((event) => eventSet.has(event.id)),
    evidence: investigation.evidence.filter((record) => evidenceSet.has(record.id)).map((record) => evidenceById.get(record.id) ?? record),
    causalEdges: investigation.causalEdges.map((edge) => ({
      ...edge,
      supportingEvidenceIds: edge.supportingEvidenceIds.filter((id) => evidenceSet.has(id)),
      contradictingEvidenceIds: edge.contradictingEvidenceIds.filter((id) => evidenceSet.has(id)),
    })),
  };
}

function alternativeControl(investigation: Investigation, replay: DecisionReplay, kind: AlternativeActionKind, requestedControlId?: string): string | undefined {
  if (kind === "continue_monitoring") return undefined;
  if (kind === "apply_control") return requestedControlId && replay.applicableControlIds.includes(requestedControlId) ? requestedControlId : replay.applicableControlIds[0];
  const preferred = kind === "suspend_workflow" ? "control-realtime" : kind === "additional_verification" ? "control-graph" : "control-review";
  return replay.applicableControlIds.includes(preferred) ? preferred : replay.applicableControlIds[0];
}

export function defaultDecisionAlternatives(investigation: Investigation, replay: DecisionReplay): DecisionAlternative[] {
  const controlId = replay.applicableControlIds[0];
  return [
    { id: `${replay.decisionPoint.id}-continue`, kind: "continue_monitoring", label: "Continue monitoring", description: "Keep the existing workflow and accept the current response window.", assumptions: ["No new control is introduced at this decision point."] },
    { id: `${replay.decisionPoint.id}-escalate`, kind: "escalate_investigation", label: "Escalate investigation", description: "Route the case to a higher-priority review path.", controlId: alternativeControl(investigation, replay, "escalate_investigation"), assumptions: ["Escalation changes review priority but does not prove intent."] },
    { id: `${replay.decisionPoint.id}-verify`, kind: "additional_verification", label: "Require additional verification", description: "Pause the workflow until the selected graph triage control is evaluated.", controlId: alternativeControl(investigation, replay, "additional_verification"), assumptions: ["Verification can be completed before further exposure."] },
    { id: `${replay.decisionPoint.id}-suspend`, kind: "suspend_workflow", label: "Temporarily suspend workflow", description: "Use the fastest applicable control to suspend suspicious activity.", controlId: alternativeControl(investigation, replay, "suspend_workflow"), assumptions: ["Suspension is operationally feasible at the selected decision time."] },
    { id: `${replay.decisionPoint.id}-control`, kind: "apply_control", label: "Apply configurable control", description: "Select a known eligible control and compare its seeded scenario.", controlId, assumptions: ["The chosen control is available at the decision point."] },
  ];
}

export function evaluateDecisionAlternative(investigation: Investigation, replay: DecisionReplay, alternative: DecisionAlternative, seed = 20261114): DecisionAlternativeResult {
  const snapshot = snapshotAtDecision(investigation, replay);
  const controlId = alternativeControl(investigation, replay, alternative.kind, alternative.controlId);
  const feasible = alternative.kind === "continue_monitoring" || Boolean(controlId);
  const feasibilityReasons = feasible ? ["The replay contains the required information boundary and applicable control path."] : ["No applicable control was available from the decision-time evidence boundary."];
  const simulation = controlId && feasible ? runCounterfactual(snapshot, controlId, seed) : runBaseline(snapshot, seed);
  const resultWithoutHash = { alternative, replayId: replay.replayId, simulation, feasible, feasibilityReasons, historicalFact: false as const };
  return { ...resultWithoutHash, resultHash: hashCanonical(resultWithoutHash) };
}

export function createInvestigationBranch(investigation: Investigation, replay: DecisionReplay, result: DecisionAlternativeResult, forkedAt = replay.knowledgeCutoff): InvestigationBranch {
  const snapshotHash = hashCanonical({ parentInvestigationId: investigation.id, decisionPointId: replay.decisionPoint.id, availableEventIds: replay.knownEventIds, availableEvidenceIds: replay.knownEvidenceIds });
  const branchWithoutId = { parentInvestigationId: investigation.id, forkDecisionPointId: replay.decisionPoint.id, forkedAt, availableEventIds: [...replay.knownEventIds], availableEvidenceIds: [...replay.knownEvidenceIds], chosenAlternativeId: result.alternative.id, chosenAction: result.alternative.kind, controlId: result.alternative.controlId, seed: result.simulation.seed, replayHash: replay.replayHash, simulationInputHash: result.simulation.input.inputHash, resultHash: result.resultHash, snapshotHash, immutableParent: true as const };
  return { id: `branch-${hashCanonical(branchWithoutId).slice(7, 23)}`, ...branchWithoutId };
}

export function compareBranches(branches: InvestigationBranch[]): InvestigationBranch[] {
  return [...branches].sort((a, b) => a.id.localeCompare(b.id));
}

export function analyzeDecisionQuality(investigation: Investigation, replay: DecisionReplay): DecisionQualityAnalysis {
  const decision = investigation.events.find((event) => event.id === replay.decisionPoint.eventId);
  const alert = investigation.events.find((event) => event.kind === "alert" && replay.generatedAlertIds.includes(event.id));
  const responseDelayMinutes = alert && decision ? Math.max(0, Math.round((Date.parse(decision.occurredAt) - Date.parse(knowledgeTime(alert))) / 60000)) : null;
  return {
    decisionPointId: replay.decisionPoint.id,
    informationAvailableAtTime: [...replay.knownEventIds, ...replay.knownEvidenceIds],
    policyRequirements: ["Record what was knowable before evaluating whether the response was reasonable.", "Do not infer intent from an alert alone."],
    interventionFeasibility: investigation.controls.filter((control) => replay.applicableControlIds.includes(control.id)).map((control) => `${control.label}: ${control.interventionDelayMinutes} minute model delay.`),
    responseDelayMinutes,
    expectedTradeoffs: ["Faster intervention may reduce exposure while increasing workflow friction.", "Escalation may improve review coverage without identifying the causal mechanism."],
    evidenceLimitations: replay.hindsightExcludedEvidenceIds.map((id) => `${id} was not available at this decision point.`),
    observations: ["This is a structured decision review, not a numerical quality score.", "Later outcomes are not used to grade the historical actor's information state."],
    scored: false,
  };
}
