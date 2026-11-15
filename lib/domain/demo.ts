import { hashEvidencePayload } from "./canonical";
import type { EvidenceRecord, Investigation } from "./types";

const evidence = (id: string, type: EvidenceRecord["type"], title: string, source: string, observedAt: string, rationale: string, payload: Record<string, string>, status: EvidenceRecord["status"], challenges: string[], contradictsEvidenceIds: string[]): EvidenceRecord => {
  const integrityHash = hashEvidencePayload(payload);
  return {
    id, type, title, source, observedAt, rationale, payload, integrityHash, originalPayload: payload, originalIntegrityHash: integrityHash, status,
    challenges, contradictsEvidenceIds,
    availableAt: observedAt,
    history: [{ id: `${id}-0`, evidenceId: id, kind: "created", reason: "Initial synthetic evidence record.", recordedAt: observedAt, previousStatus: null, nextStatus: status, originalIntegrityHash: integrityHash }],
  };
};

export const demoInvestigation: Investigation = {
  id: "INV-2026-041",
  title: "Northstar lane / coordinated account activity",
  status: "review",
  currency: "EUR",
  events: [
    { id: "evt-001", kind: "account", occurredAt: "2026-04-08T08:02:00+00:00", ingestedAt: "2026-04-08T08:03:00+00:00", knowledgeAt: "2026-04-08T08:03:00+00:00", actorId: "actor-a", accountId: "acct-17", summary: "Account created with shared device fingerprint", sourceRef: "ledger://accounts/17", attributes: { region: "EU" } },
    { id: "evt-002", kind: "transaction", occurredAt: "2026-04-08T08:17:00+00:00", ingestedAt: "2026-04-08T08:18:00+00:00", knowledgeAt: "2026-04-08T08:18:00+00:00", actorId: "actor-a", accountId: "acct-17", summary: "Outbound transfer to newly seen beneficiary", amountCents: 4200000, sourceRef: "ledger://tx/002", attributes: { pattern: "rapid_reuse" } },
    { id: "evt-003", kind: "transaction", occurredAt: "2026-04-08T08:21:00+00:00", ingestedAt: "2026-04-08T08:22:00+00:00", knowledgeAt: "2026-04-08T08:22:00+00:00", actorId: "actor-b", accountId: "acct-22", summary: "Mirrored outbound transfer", amountCents: 3800000, sourceRef: "ledger://tx/003", attributes: { pattern: "rapid_reuse" } },
    { id: "evt-004", kind: "alert", occurredAt: "2026-04-08T08:25:00+00:00", detectedAt: "2026-04-08T08:25:00+00:00", ingestedAt: "2026-04-08T10:14:00+00:00", knowledgeAt: "2026-04-08T10:14:00+00:00", actorId: "system-monitor", accountId: "acct-17", summary: "Velocity alert queued behind batch window", sourceRef: "monitor://alerts/004", attributes: { queue: "batch-3" } },
    { id: "evt-005", kind: "observation", occurredAt: "2026-04-08T08:26:00+00:00", ingestedAt: "2026-04-08T08:29:00+00:00", knowledgeAt: "2026-04-08T08:29:00+00:00", actorId: "actor-c", accountId: "acct-31", summary: "Shared beneficiary appears across three accounts", sourceRef: "case-note://obs/005", attributes: { contextMissing: "true" } },
    { id: "evt-006", kind: "decision", occurredAt: "2026-04-08T10:29:00+00:00", ingestedAt: "2026-04-08T10:31:00+00:00", knowledgeAt: "2026-04-08T10:31:00+00:00", actorId: "reviewer-1", accountId: "acct-17", summary: "Manual review opened; funds already dispersed", sourceRef: "review://decision/006", attributes: { decision: "review" } },
    { id: "evt-007", kind: "transaction", occurredAt: "2026-04-08T11:04:00+00:00", ingestedAt: "2026-04-08T11:05:00+00:00", knowledgeAt: "2026-04-08T11:05:00+00:00", actorId: "actor-c", accountId: "acct-31", summary: "Final transfer closes the observed loss window", amountCents: 16000000, sourceRef: "ledger://tx/007", attributes: { pattern: "rapid_reuse" } },
  ],
  evidence: [
    evidence("evd-001", "observed_fact", "Three accounts reused one beneficiary", "Ledger joins / beneficiary index", "2026-04-08T08:26:00+00:00", "Directly observed in synthetic ledger records; join key and source references are retained.", { relation: "beneficiary-9", accounts: "acct-17|acct-22|acct-31" }, "active", [], []),
    evidence("evd-002", "reported_claim", "Batch delay caused alert lateness", "Operations interview note", "2026-04-08T12:00:00+00:00", "Reported by an operator; no independent queue audit was available in the synthetic packet.", { claim: "batch window delayed alert", reporter: "operator-4" }, "challenged", ["The queue timestamp proves delay, but not why the queue was delayed."], ["evd-003"]),
    evidence("evd-003", "inferred_relationship", "Shared device suggests coordination", "Device fingerprint correlation", "2026-04-08T08:02:00+00:00", "Correlation across account metadata; alternative explanations such as shared infrastructure remain open.", { fingerprint: "dfp-44", accounts: "acct-17|acct-22" }, "active", ["Shared infrastructure may explain the same observation."], ["evd-002"]),
    evidence("evd-004", "assumption", "Earlier intervention would have reduced exposure", "Scenario assumption register", "2026-04-08T12:30:00+00:00", "Required for simulation; not observed in the incident record.", { assumption: "earlier control reduces loss exposure" }, "active", [], []),
  ],
  causalNodes: [
    { id: "node-1", label: "Coordinated account use", kind: "condition", temporalAnchor: "2026-04-08T08:02:00+00:00" },
    { id: "node-2", label: "Monitoring delay", kind: "mechanism", temporalAnchor: "2026-04-08T08:25:00+00:00" },
    { id: "node-3", label: "Intervention window missed", kind: "mechanism", temporalAnchor: "2026-04-08T10:29:00+00:00" },
    { id: "node-4", label: "€240k simulated loss", kind: "outcome", temporalAnchor: "2026-04-08T11:04:00+00:00" },
  ],
  causalEdges: [
    { id: "edge-1", from: "node-1", to: "node-2", label: "increased alert load", supportingEvidenceIds: ["evd-001"], contradictingEvidenceIds: [], assumptions: ["Shared beneficiary use increased monitor workload."], missingEvidenceIds: [], sourceReliability: { rating: "moderate", considerations: ["Ledger join is direct, but it does not observe intent or workload causation."] }, causalStatus: "plausible", evidenceMode: "observational", interventionEvidenceIds: [], confounderNodeIds: [], temporalOnly: false },
    { id: "edge-2", from: "node-2", to: "node-3", label: "compressed response time", supportingEvidenceIds: ["evd-002", "evd-004"], contradictingEvidenceIds: [], assumptions: ["A timely alert would have reached review before dispersion."], missingEvidenceIds: ["missing-independent-queue-audit"], sourceReliability: { rating: "low", considerations: ["The delay is reported, not independently audited.", "The assumption links earlier alerting to reduced exposure."] }, causalStatus: "unidentifiable", evidenceMode: "observational", interventionEvidenceIds: [], confounderNodeIds: [], temporalOnly: false },
    { id: "edge-3", from: "node-1", to: "node-4", label: "alternative explanation", supportingEvidenceIds: ["evd-003"], contradictingEvidenceIds: ["evd-002"], assumptions: ["Coordination, rather than independent reuse, explains the pattern."], missingEvidenceIds: ["missing-independent-device-validation"], sourceReliability: { rating: "low", considerations: ["Device correlation is compatible with shared infrastructure.", "The reported delay is a competing explanation for the outcome."] }, causalStatus: "unidentifiable", evidenceMode: "observational", interventionEvidenceIds: [], confounderNodeIds: [], temporalOnly: true },
  ],
  controls: [
    { id: "control-realtime", label: "Real-time velocity gate", description: "Pause a transfer when velocity and beneficiary novelty co-occur.", interventionDelayMinutes: 12, detectionLift: 0.72, friction: 0.22, targetsHypothesisIds: ["edge-1"], sensitivityBps: 700, seedVarianceBps: 150 },
    { id: "control-graph", label: "Beneficiary graph triage", description: "Prioritize accounts connected to an already flagged beneficiary.", interventionDelayMinutes: 38, detectionLift: 0.54, friction: 0.12, targetsHypothesisIds: ["edge-1"], sensitivityBps: 900, seedVarianceBps: 150 },
    { id: "control-review", label: "Human review escalation", description: "Escalate repeat alerts to an on-call reviewer before batch close.", interventionDelayMinutes: 74, detectionLift: 0.39, friction: 0.08, targetsHypothesisIds: ["edge-1"], sensitivityBps: 1200, seedVarianceBps: 150 },
  ],
};
