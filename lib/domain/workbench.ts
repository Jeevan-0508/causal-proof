import { z } from "zod";
import { hashCanonical } from "./canonical";
import { reconstructTimeline, validateCausalGraph } from "./kernel";
import { CausalEdgeSchema, CausalNodeSchema, ControlSchema, type CausalEdge, type CausalNode, type EvidenceRecord, type HypothesisAssessment, type IncidentEvent, type Investigation, type TimelineItem, type ValidationIssue } from "./types";

export const GraphStateSchema = z.object({
  causalNodes: z.array(CausalNodeSchema),
  causalEdges: z.array(CausalEdgeSchema),
  controls: z.array(ControlSchema),
});
export type GraphState = z.infer<typeof GraphStateSchema>;

export type GraphRevision = { version: number; graphHash: string; graph: GraphState; createdAt: string };

export function graphState(investigation: Investigation): GraphState {
  return { causalNodes: investigation.causalNodes, causalEdges: investigation.causalEdges, controls: investigation.controls };
}

export function validateGraphEdit(investigation: Investigation, candidate: GraphState): { valid: boolean; issues: ValidationIssue[] } {
  const parsed = GraphStateSchema.safeParse(candidate);
  if (!parsed.success) return { valid: false, issues: [{ code: "schema", severity: "error", message: parsed.error.issues[0]?.message ?? "Graph schema is invalid." }] };
  const issues: ValidationIssue[] = [];
  const unique = (values: string[], code: string, label: string) => {
    const seen = new Set<string>();
    for (const value of values) if (seen.has(value)) issues.push({ code, severity: "error", message: `Duplicate ${label} identity: ${value}.` }); else seen.add(value);
  };
  unique(candidate.causalNodes.map((node) => node.id), "duplicate_node", "node");
  unique(candidate.causalEdges.map((edge) => edge.id), "duplicate_edge", "edge");
  const result = validateCausalGraph({ ...investigation, ...candidate });
  issues.push(...result.issues);
  const nodeIds = new Set(candidate.causalNodes.map((node) => node.id));
  const evidenceIds = new Set(investigation.evidence.map((record) => record.id));
  const evidenceById = new Map(investigation.evidence.map((record) => [record.id, record]));
  const edgeIds = new Set(candidate.causalEdges.map((edge) => edge.id));
  for (const edge of candidate.causalEdges) {
    for (const id of edge.interventionEvidenceIds) {
      if (!evidenceIds.has(id)) issues.push({ code: "unknown_intervention_evidence", severity: "error", message: `Edge ${edge.id} references unknown intervention evidence ${id}.`, hypothesisId: edge.id });
      else if (evidenceById.get(id)?.status !== "active") issues.push({ code: "inactive_intervention_evidence", severity: "error", message: `Edge ${edge.id} references intervention evidence ${id} that is not active.`, hypothesisId: edge.id });
    }
    if (edge.causalStatus === "established" && (edge.evidenceMode !== "interventional" || edge.interventionEvidenceIds.length === 0)) issues.push({ code: "unsupported_established_status", severity: "error", message: `Edge ${edge.id} cannot be established without active intervention evidence.`, hypothesisId: edge.id });
    for (const id of edge.confounderNodeIds) if (!nodeIds.has(id)) issues.push({ code: "unknown_confounder", severity: "error", message: `Edge ${edge.id} references unknown confounder node ${id}.`, hypothesisId: edge.id });
    if (edge.from === edge.to) issues.push({ code: "self_edge", severity: "error", message: `Edge ${edge.id} cannot connect a node to itself.`, hypothesisId: edge.id });
  }
  for (const control of candidate.controls) for (const hypothesisId of control.targetsHypothesisIds) if (!edgeIds.has(hypothesisId)) issues.push({ code: "unknown_control_target", severity: "error", message: `Control ${control.id} targets unknown hypothesis ${hypothesisId}.`, hypothesisId });
  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

export function graphHash(graph: GraphState): string { return hashCanonical(graph); }

export type TimelineClock = "occurrence" | "detection" | "ingestion" | "availability" | "knowledge" | "mutation";
export type ForensicTimelineRow = {
  id: string;
  kind: "event" | "evidence" | "mutation";
  label: string;
  source: string;
  event?: IncidentEvent;
  evidence?: EvidenceRecord;
  mutationId?: string;
  clocks: Partial<Record<TimelineClock, string>>;
  availableAt: string;
  excludedByCutoff: boolean;
  flags: TimelineItem["flags"];
};

const eventKnowledge = (event: IncidentEvent) => event.knowledgeAt ?? event.detectedAt ?? event.ingestedAt;

export function buildForensicTimeline(investigation: Investigation, cutoff?: string): ForensicTimelineRow[] {
  const cutoffTime = cutoff ? Date.parse(cutoff) : Number.POSITIVE_INFINITY;
  const rows: ForensicTimelineRow[] = [];
  for (const item of reconstructTimeline(investigation.events)) {
    const knowledge = eventKnowledge(item);
    rows.push({ id: item.id, kind: "event", label: item.summary, source: item.sourceRef, event: item, clocks: { occurrence: item.occurredAt, detection: item.detectedAt ?? undefined, ingestion: item.ingestedAt, knowledge }, availableAt: knowledge, excludedByCutoff: Date.parse(knowledge) > cutoffTime, flags: item.flags });
  }
  for (const record of investigation.evidence) {
    rows.push({ id: record.id, kind: "evidence", label: record.title, source: record.source, evidence: record, clocks: { occurrence: record.observedAt, availability: record.availableAt }, availableAt: record.availableAt, excludedByCutoff: Date.parse(record.availableAt) > cutoffTime, flags: [] });
    for (const mutation of record.history) rows.push({ id: mutation.id, kind: "mutation", label: `${mutation.kind} · ${record.title}`, source: record.source, evidence: record, mutationId: mutation.id, clocks: { mutation: mutation.recordedAt }, availableAt: mutation.recordedAt, excludedByCutoff: Date.parse(mutation.recordedAt) > cutoffTime, flags: [] });
  }
  return rows.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt) || a.id.localeCompare(b.id));
}

export function historicalRows(investigation: Investigation, cutoff: string): ForensicTimelineRow[] {
  return buildForensicTimeline(investigation, cutoff).filter((row) => !row.excludedByCutoff);
}

export type HypothesisComparison = {
  hypothesisIds: string[];
  sharedSupportingEvidenceIds: string[];
  sharedContradictingEvidenceIds: string[];
  uniqueEvidenceByHypothesis: Record<string, string[]>;
  unresolvedMissingEvidenceIds: string[];
  sharedConfounderNodeIds: string[];
};

export function compareHypothesisAssessments(assessments: HypothesisAssessment[], selectedIds: string[]): HypothesisComparison {
  const selected = assessments.filter((assessment) => selectedIds.includes(assessment.hypothesisId));
  if (!selected.length) return { hypothesisIds: [], sharedSupportingEvidenceIds: [], sharedContradictingEvidenceIds: [], uniqueEvidenceByHypothesis: {}, unresolvedMissingEvidenceIds: [], sharedConfounderNodeIds: [] };
  const intersection = (values: string[][]) => values.reduce((shared, current) => shared.filter((value) => current.includes(value)));
  const uniqueEvidenceByHypothesis = Object.fromEntries(selected.map((assessment) => [assessment.hypothesisId, [...new Set([...assessment.activeSupportingEvidenceIds, ...assessment.activeContradictingEvidenceIds])].filter((id) => selected.every((other) => other.hypothesisId === assessment.hypothesisId || ![...other.activeSupportingEvidenceIds, ...other.activeContradictingEvidenceIds].includes(id)))]));
  return { hypothesisIds: selected.map((item) => item.hypothesisId), sharedSupportingEvidenceIds: intersection(selected.map((item) => item.activeSupportingEvidenceIds)), sharedContradictingEvidenceIds: intersection(selected.map((item) => item.activeContradictingEvidenceIds)), uniqueEvidenceByHypothesis, unresolvedMissingEvidenceIds: [...new Set(selected.flatMap((item) => item.missingEvidenceIds))], sharedConfounderNodeIds: intersection(selected.map((item) => item.confounderNodeIds)) };
}
