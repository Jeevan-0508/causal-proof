import { hashCanonical } from "./canonical";
import type {
  CausalEdge,
  EvidenceChange,
  EvidenceMutation,
  EvidenceRecord,
  HypothesisAssessment,
  IncidentEvent,
  InterventionEligibility,
  Investigation,
  SimulationComparison,
  SimulationInput,
  SimulationResult,
  TimelineItem,
  ValidationIssue,
  ReplayReportContext,
} from "./types";

const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
const nowForHistory = () => "2026-04-08T12:00:00+00:00";

export function reconstructTimeline(events: IncidentEvent[]): TimelineItem[] {
  return [...events]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id))
    .map((event) => {
      const lag = minutesBetween(event.occurredAt, event.ingestedAt);
      const flags: TimelineItem["flags"] = [];
      if (lag > 60) flags.push("ingestion_lag");
      if (lag < 0) flags.push("timestamp_conflict");
      if (event.attributes.contextMissing === "true") flags.push("missing_context");
      return {
        ...event,
        flags,
        eventTimeLabel: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(event.occurredAt)),
        ingestionLagMinutes: Math.max(0, lag),
      };
    });
}

function pathExists(adjacency: Map<string, string[]>, start: string, target: string, seen = new Set<string>()): boolean {
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return (adjacency.get(start) ?? []).some((next) => pathExists(adjacency, next, target, seen));
}

function findCycle(edges: CausalEdge[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  for (const edge of edges) {
    if (edge.from === edge.to || pathExists(adjacency, edge.to, edge.from, new Set())) return [edge.from, edge.to, edge.from];
  }
  return null;
}

export function identifyConfounders(investigation: Investigation, edge: CausalEdge): string[] {
  const adjacency = new Map<string, string[]>();
  for (const candidate of investigation.causalEdges) adjacency.set(candidate.from, [...(adjacency.get(candidate.from) ?? []), candidate.to]);
  return investigation.causalNodes
    .map((node) => node.id)
    .filter((nodeId) => nodeId !== edge.from && nodeId !== edge.to && pathExists(adjacency, nodeId, edge.from, new Set()) && pathExists(adjacency, nodeId, edge.to, new Set()));
}

export function validateCausalGraph(investigation: Investigation): { valid: boolean; issues: ValidationIssue[] } {
  const nodeIds = new Set(investigation.causalNodes.map((node) => node.id));
  const evidenceIds = new Set(investigation.evidence.map((record) => record.id));
  const issues: ValidationIssue[] = [];
  for (const edge of investigation.causalEdges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) issues.push({ code: "unknown_node", severity: "error", message: `Hypothesis ${edge.id} references a node that does not exist.`, hypothesisId: edge.id });
    for (const evidenceId of [...edge.supportingEvidenceIds, ...edge.contradictingEvidenceIds]) {
      if (!evidenceIds.has(evidenceId)) issues.push({ code: "unknown_evidence", severity: "error", message: `Hypothesis ${edge.id} references missing evidence ${evidenceId}.`, hypothesisId: edge.id });
    }
    const from = investigation.causalNodes.find((node) => node.id === edge.from);
    const to = investigation.causalNodes.find((node) => node.id === edge.to);
    if (from?.temporalAnchor && to?.temporalAnchor && Date.parse(from.temporalAnchor) > Date.parse(to.temporalAnchor)) issues.push({ code: "temporal_order", severity: "error", message: `Hypothesis ${edge.id} runs from a later temporal anchor to an earlier one.`, hypothesisId: edge.id });
    if (!edge.temporalOnly && edge.evidenceMode === "observational") issues.push({ code: "observational_causation", severity: "warning", message: `Hypothesis ${edge.id} is observational; it cannot establish causation without identification assumptions and intervention evidence.`, hypothesisId: edge.id });
    if (edge.evidenceMode === "interventional" && !edge.interventionEvidenceIds.length) issues.push({ code: "interventional_evidence_missing", severity: "error", message: `Hypothesis ${edge.id} is marked interventional without an intervention evidence reference.`, hypothesisId: edge.id });
    if (!edge.supportingEvidenceIds.length) issues.push({ code: "unsupported_edge", severity: "warning", message: `Hypothesis ${edge.id} has no supporting evidence.`, hypothesisId: edge.id });
    if (!edge.assumptions.length) issues.push({ code: "missing_assumption", severity: "error", message: `Hypothesis ${edge.id} has no identification assumption.`, hypothesisId: edge.id });
  }
  const cycle = findCycle(investigation.causalEdges);
  if (cycle) issues.push({ code: "cycle", severity: "error", message: `Causal graph contains a cycle: ${cycle.join(" → ")}.` });
  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

export function assessHypothesis(investigation: Investigation, edge: CausalEdge): HypothesisAssessment {
  const evidenceById = new Map(investigation.evidence.map((record) => [record.id, record]));
  const activeSupportingEvidenceIds = edge.supportingEvidenceIds.filter((id) => evidenceById.get(id)?.status === "active");
  const activeContradictingEvidenceIds = edge.contradictingEvidenceIds.filter((id) => evidenceById.get(id)?.status === "active");
  const warnings: string[] = [];
  let causalStatus: HypothesisAssessment["causalStatus"] = edge.causalStatus;
  if (edge.temporalOnly || activeSupportingEvidenceIds.length === 0 || edge.missingEvidenceIds.length > 0) causalStatus = "unidentifiable";
  else if (edge.evidenceMode === "observational" || activeContradictingEvidenceIds.length > 0) causalStatus = "plausible";
  else causalStatus = "established";
  if (edge.evidenceMode === "observational") warnings.push("Observational evidence alone does not identify this causal effect.");
  if (edge.missingEvidenceIds.length) warnings.push(`Missing evidence: ${edge.missingEvidenceIds.join(", ")}.`);
  if (activeContradictingEvidenceIds.length) warnings.push(`Active contradictory evidence: ${activeContradictingEvidenceIds.join(", ")}.`);
  if (edge.temporalOnly) warnings.push("Temporal ordering is present, but causal identification is not claimed.");
  return {
    hypothesisId: edge.id,
    causalStatus,
    supportingEvidenceIds: edge.supportingEvidenceIds,
    contradictingEvidenceIds: edge.contradictingEvidenceIds,
    activeSupportingEvidenceIds,
    activeContradictingEvidenceIds,
    missingEvidenceIds: edge.missingEvidenceIds,
    assumptions: edge.assumptions,
    sourceReliability: edge.sourceReliability,
    confounderNodeIds: edge.confounderNodeIds,
    warnings,
  };
}

export function deriveHypothesisAssessments(investigation: Investigation): HypothesisAssessment[] {
  return investigation.causalEdges.map((edge) => ({ ...assessHypothesis(investigation, edge), confounderNodeIds: edge.confounderNodeIds.length ? edge.confounderNodeIds : identifyConfounders(investigation, edge) }));
}

function withMutation(record: EvidenceRecord, action: EvidenceMutation["kind"], reason: string, nextStatus: EvidenceRecord["status"]): EvidenceRecord {
  const mutation: EvidenceMutation = {
    id: `${record.id}-${record.history.length + 1}`,
    evidenceId: record.id,
    kind: action,
    reason: reason.trim(),
    recordedAt: nowForHistory(),
    previousStatus: record.status,
    nextStatus,
    originalIntegrityHash: record.originalIntegrityHash,
  };
  return { ...record, status: nextStatus, challenges: action === "challenged" ? [...record.challenges, reason.trim()] : record.challenges, history: [...record.history, mutation] };
}

export function changeEvidenceStatus(investigation: Investigation, evidenceId: string, action: EvidenceChange["action"], reason: string): EvidenceChange {
  if (!reason.trim()) throw new Error("A challenge or status-change rationale is required.");
  const before = deriveHypothesisAssessments(investigation);
  const evidence = investigation.evidence.map((record) => record.id === evidenceId ? withMutation(record, action === "challenge" ? "challenged" : action === "withdraw" ? "withdrawn" : "restored", reason, action === "challenge" ? "challenged" : action === "withdraw" ? "withdrawn" : "active") : record);
  if (!investigation.evidence.some((record) => record.id === evidenceId)) throw new Error(`Unknown evidence: ${evidenceId}`);
  const nextInvestigation = { ...investigation, evidence };
  return { investigation: nextInvestigation, evidenceId, action, reason: reason.trim(), before, after: deriveHypothesisAssessments(nextInvestigation) };
}

export function challengeEvidence(evidence: EvidenceRecord[], evidenceId: string, challenge: string): EvidenceRecord[] {
  const record = evidence.find((item) => item.id === evidenceId);
  if (!record) throw new Error(`Unknown evidence: ${evidenceId}`);
  return evidence.map((item) => item.id === evidenceId ? withMutation(item, "challenged", challenge, "challenged") : item);
}

export function restoreEvidence(evidence: EvidenceRecord[], evidenceId: string, reason: string): EvidenceRecord[] {
  const record = evidence.find((item) => item.id === evidenceId);
  if (!record) throw new Error(`Unknown evidence: ${evidenceId}`);
  return evidence.map((item) => item.id === evidenceId ? withMutation(item, "restored", reason, "active") : item);
}

export function withdrawEvidence(evidence: EvidenceRecord[], evidenceId: string, reason: string): EvidenceRecord[] {
  const record = evidence.find((item) => item.id === evidenceId);
  if (!record) throw new Error(`Unknown evidence: ${evidenceId}`);
  return evidence.map((item) => item.id === evidenceId ? withMutation(item, "withdrawn", reason, "withdrawn") : item);
}

export function affectedHypotheses(investigation: Investigation, evidence: EvidenceRecord): string[] {
  return investigation.causalEdges.filter((edge) => edge.supportingEvidenceIds.includes(evidence.id) || edge.contradictingEvidenceIds.includes(evidence.id)).map((edge) => edge.id);
}

export function checkInterventionEligibility(investigation: Investigation, controlId: string): InterventionEligibility {
  const control = investigation.controls.find((item) => item.id === controlId);
  if (!control) return { eligible: false, issues: [{ code: "unknown_control", severity: "error", message: `Unknown control: ${controlId}.` }], targetHypothesisIds: [] };
  const graph = validateCausalGraph(investigation);
  const assessments = deriveHypothesisAssessments(investigation);
  const issues = [...graph.issues];
  for (const hypothesisId of control.targetsHypothesisIds) {
    const assessment = assessments.find((item) => item.hypothesisId === hypothesisId);
    if (!assessment) issues.push({ code: "unknown_hypothesis", severity: "error", message: `Control ${controlId} targets unknown hypothesis ${hypothesisId}.`, hypothesisId });
    else if (assessment.causalStatus === "unidentifiable") issues.push({ code: "unidentifiable_target", severity: "warning", message: `Control ${controlId} targets ${hypothesisId}, which is not causally identified.`, hypothesisId });
  }
  return { eligible: !issues.some((issue) => issue.severity === "error"), issues, targetHypothesisIds: control.targetsHypothesisIds };
}

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function baselineLoss(investigation: Investigation): number {
  return investigation.events.filter((event) => event.kind === "transaction").reduce((sum, event) => sum + (event.amountCents ?? 0), 0);
}

export function runBaseline(investigation: Investigation, seed = 20261114): SimulationResult {
  const cents = baselineLoss(investigation);
  const assumptions = ["Baseline replays observed synthetic transaction amounts; it is not a forecast.", "No empirical probability distribution is assumed."];
  const inputWithoutHash: Omit<SimulationInput, "inputHash"> = { scenarioId: investigation.id, controlId: "baseline", seed, baselineLossCents: cents, controlParameters: { interventionDelayMinutes: 0, detectionLift: 0, friction: 0, sensitivityBps: 0, seedVarianceBps: 0 }, assumptions };
  const input = { ...inputWithoutHash, inputHash: hashCanonical(inputWithoutHash) };
  return { scenarioId: investigation.id, controlId: "baseline", seed, baselineLossCents: cents, lossCents: cents, avoidedLossCents: 0, alertLeadMinutes: 0, uncertaintyCents: { low: cents, high: cents }, assumptions, input, simulated: true };
}

export function runCounterfactual(investigation: Investigation, controlId: string, seed = 20261114, sensitivityOverrideBps?: number): SimulationResult {
  if (sensitivityOverrideBps !== undefined && (!Number.isInteger(sensitivityOverrideBps) || sensitivityOverrideBps < 0 || sensitivityOverrideBps > 5000)) throw new Error("Sensitivity must be an integer between 0 and 5000 basis points.");
  const control = investigation.controls.find((item) => item.id === controlId);
  if (!control) throw new Error(`Unknown control: ${controlId}`);
  const eligibility = checkInterventionEligibility(investigation, controlId);
  if (!eligibility.eligible) throw new Error(eligibility.issues.map((issue) => issue.message).join(" "));
  const cents = baselineLoss(investigation);
  const assumptions = [
    "Synthetic transaction volume and loss are held constant across scenarios.",
    "Detection lift and friction are explicit illustrative parameters, not observed prevention rates.",
    "Sensitivity is an analyst-declared range, not a fitted probability distribution.",
    "The result is simulated and must not be described as proven prevented loss.",
  ];
  const inputWithoutHash: Omit<SimulationInput, "inputHash"> = { scenarioId: investigation.id, controlId, seed, baselineLossCents: cents, controlParameters: { interventionDelayMinutes: control.interventionDelayMinutes, detectionLift: control.detectionLift, friction: control.friction, sensitivityBps: sensitivityOverrideBps ?? control.sensitivityBps, seedVarianceBps: control.seedVarianceBps }, assumptions };
  const input = { ...inputWithoutHash, inputHash: hashCanonical(inputWithoutHash) };
  const baseEffectBps = Math.round(control.detectionLift * (1 - control.friction) * (1 - control.interventionDelayMinutes / 240) * 10000);
  const seedOffsetBps = Math.round((seededUnit(seed) - 0.5) * control.seedVarianceBps);
  const effectiveEffectBps = Math.max(0, Math.min(10000, baseEffectBps + seedOffsetBps));
  const lossCents = Math.round(cents * (10000 - effectiveEffectBps) / 10000);
  const sensitivityBps = sensitivityOverrideBps ?? control.sensitivityBps;
  const lowEffect = Math.max(0, effectiveEffectBps - sensitivityBps);
  const highEffect = Math.min(10000, effectiveEffectBps + sensitivityBps);
  return { scenarioId: investigation.id, controlId, seed, baselineLossCents: cents, lossCents, avoidedLossCents: Math.max(0, cents - lossCents), alertLeadMinutes: Math.max(0, 180 - control.interventionDelayMinutes), uncertaintyCents: { low: Math.round(cents * (10000 - highEffect) / 10000), high: Math.round(cents * (10000 - lowEffect) / 10000) }, assumptions, input, simulated: true };
}

export function compareScenarios(investigation: Investigation, controlId: string, seed = 20261114, sensitivityOverrideBps?: number): SimulationComparison {
  const baseline = runBaseline(investigation, seed);
  const intervention = runCounterfactual(investigation, controlId, seed, sensitivityOverrideBps);
  return { baseline, intervention, differenceCents: baseline.lossCents - intervention.lossCents, sensitivityBps: intervention.input.controlParameters.sensitivityBps };
}

export function exportReport(investigation: Investigation, simulation?: SimulationResult, generatedAt = "2026-04-08T12:00:00+00:00", replayContext?: ReplayReportContext) {
  const chronology = reconstructTimeline(investigation.events);
  return {
    reportVersion: "0.2",
    generatedAt,
    investigationId: investigation.id,
    title: investigation.title,
    executiveSummary: "Synthetic logistics-fraud investigation with delayed monitoring, conflicting evidence, and competing causal explanations.",
    chronology,
    evidence: investigation.evidence,
    causalHypotheses: deriveHypothesisAssessments(investigation),
    graphValidation: validateCausalGraph(investigation),
    simulation: simulation ?? null,
    replay: replayContext ?? null,
    limitations: ["No causal claim is stronger than its evidence and assumptions.", "Integrity hashes provide tamper evidence for canonical payloads, not authenticity.", "Counterfactual outputs are model simulations, not observed outcomes."],
  };
}
