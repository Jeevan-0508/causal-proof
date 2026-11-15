import { z } from "zod";

export const EventKindSchema = z.enum([
  "transaction",
  "alert",
  "control",
  "decision",
  "account",
  "observation",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

export const EventSchema = z.object({
  id: z.string().min(1),
  kind: EventKindSchema,
  occurredAt: z.string().datetime({ offset: true }),
  ingestedAt: z.string().datetime({ offset: true }),
  detectedAt: z.string().datetime({ offset: true }).nullable().optional(),
  knowledgeAt: z.string().datetime({ offset: true }).nullable().optional(),
  actorId: z.string().min(1),
  accountId: z.string().min(1),
  summary: z.string().min(1),
  amountCents: z.number().int().nonnegative().optional(),
  sourceRef: z.string().min(1),
  attributes: z.record(z.string(), z.string()),
});
export type IncidentEvent = z.infer<typeof EventSchema>;

export const EvidenceTypeSchema = z.enum(["observed_fact", "reported_claim", "inferred_relationship", "assumption"]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceStatusSchema = z.enum(["active", "challenged", "withdrawn"]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const ReliabilityRatingSchema = z.enum(["unknown", "low", "moderate", "high"]);
export type ReliabilityRating = z.infer<typeof ReliabilityRatingSchema>;

export const SourceReliabilitySchema = z.object({
  rating: ReliabilityRatingSchema,
  considerations: z.array(z.string().min(1)).min(1),
});
export type SourceReliability = z.infer<typeof SourceReliabilitySchema>;

export const EvidenceMutationSchema = z.object({
  id: z.string().min(1),
  evidenceId: z.string().min(1),
  kind: z.enum(["created", "challenged", "withdrawn", "restored"]),
  reason: z.string().min(1),
  recordedAt: z.string().datetime({ offset: true }),
  previousStatus: EvidenceStatusSchema.nullable(),
  nextStatus: EvidenceStatusSchema,
  originalIntegrityHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});
export type EvidenceMutation = z.infer<typeof EvidenceMutationSchema>;

export const EvidenceRecordSchema = z.object({
  id: z.string().min(1),
  type: EvidenceTypeSchema,
  title: z.string().min(1),
  source: z.string().min(1),
  observedAt: z.string().datetime({ offset: true }),
  availableAt: z.string().datetime({ offset: true }),
  rationale: z.string().min(1),
  payload: z.record(z.string(), z.string()),
  integrityHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  originalPayload: z.record(z.string(), z.string()),
  originalIntegrityHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  status: EvidenceStatusSchema,
  challenges: z.array(z.string()),
  contradictsEvidenceIds: z.array(z.string()),
  history: z.array(EvidenceMutationSchema),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const CausalNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["condition", "mechanism", "outcome", "intervention"]),
  temporalAnchor: z.string().datetime({ offset: true }).nullable(),
});
export const CausalStatusSchema = z.enum(["established", "plausible", "unidentifiable"]);
export type CausalStatus = z.infer<typeof CausalStatusSchema>;
export const CausalEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string(),
  supportingEvidenceIds: z.array(z.string()),
  contradictingEvidenceIds: z.array(z.string()),
  assumptions: z.array(z.string().min(1)).min(1),
  missingEvidenceIds: z.array(z.string()),
  sourceReliability: SourceReliabilitySchema,
  causalStatus: CausalStatusSchema,
  evidenceMode: z.enum(["observational", "interventional"]),
  interventionEvidenceIds: z.array(z.string()),
  confounderNodeIds: z.array(z.string()),
  temporalOnly: z.boolean(),
});
export type CausalNode = z.infer<typeof CausalNodeSchema>;
export type CausalEdge = z.infer<typeof CausalEdgeSchema>;

export const ControlSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  interventionDelayMinutes: z.number().int().nonnegative(),
  detectionLift: z.number().min(0).max(1),
  friction: z.number().min(0).max(1),
  targetsHypothesisIds: z.array(z.string()).min(1),
  sensitivityBps: z.number().int().nonnegative().max(5000),
  seedVarianceBps: z.number().int().nonnegative().max(5000),
});
export type Control = z.infer<typeof ControlSchema>;

export const InvestigationSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["open", "review", "closed"]),
  currency: z.literal("EUR"),
  events: z.array(EventSchema),
  evidence: z.array(EvidenceRecordSchema),
  causalNodes: z.array(CausalNodeSchema),
  causalEdges: z.array(CausalEdgeSchema),
  controls: z.array(ControlSchema),
});
export type Investigation = z.infer<typeof InvestigationSchema>;

export const AlternativeActionKindSchema = z.enum(["continue_monitoring", "escalate_investigation", "additional_verification", "suspend_workflow", "apply_control"]);
export type AlternativeActionKind = z.infer<typeof AlternativeActionKindSchema>;

export const DecisionPointSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  decidedAt: z.string().datetime({ offset: true }),
  actorId: z.string(),
  accountId: z.string(),
  summary: z.string(),
});
export type DecisionPoint = z.infer<typeof DecisionPointSchema>;

export type DecisionReplay = {
  replayId: string;
  investigationId: string;
  decisionPoint: DecisionPoint;
  knownEventIds: string[];
  knownEvidenceIds: string[];
  generatedAlertIds: string[];
  applicableControlIds: string[];
  priorDecisionIds: string[];
  unresolvedEvidenceIds: string[];
  hindsightExcludedEventIds: string[];
  hindsightExcludedEvidenceIds: string[];
  knowledgeCutoff: string;
  historicalEvidenceMutationIds: string[];
  snapshotHash: string;
  graphVersionHash: string;
  controlConfigurationHash: string;
  assumptions: string[];
  replayHash: string;
};

export type DecisionAlternative = {
  id: string;
  kind: AlternativeActionKind;
  label: string;
  description: string;
  controlId?: string;
  assumptions: string[];
};

export type DecisionAlternativeResult = {
  alternative: DecisionAlternative;
  replayId: string;
  simulation: SimulationResult;
  feasible: boolean;
  feasibilityReasons: string[];
  historicalFact: false;
  resultHash: string;
};

export type InvestigationBranch = {
  id: string;
  parentInvestigationId: string;
  forkDecisionPointId: string;
  forkedAt: string;
  availableEventIds: string[];
  availableEvidenceIds: string[];
  chosenAlternativeId: string;
  chosenAction: AlternativeActionKind;
  controlId?: string;
  seed: number;
  replayHash: string;
  simulationInputHash: string;
  resultHash: string;
  snapshotHash: string;
  immutableParent: true;
};

export type DecisionQualityAnalysis = {
  decisionPointId: string;
  informationAvailableAtTime: string[];
  policyRequirements: string[];
  interventionFeasibility: string[];
  responseDelayMinutes: number | null;
  expectedTradeoffs: string[];
  evidenceLimitations: string[];
  observations: string[];
  scored: false;
};

export type ReplayReportContext = {
  replays: DecisionReplay[];
  alternativeResults: DecisionAlternativeResult[];
  branches: InvestigationBranch[];
  decisionQuality: DecisionQualityAnalysis[];
};

export type TimelineFlag = "timestamp_conflict" | "ingestion_lag" | "missing_context";
export type TimelineItem = IncidentEvent & { flags: TimelineFlag[]; eventTimeLabel: string; ingestionLagMinutes: number };

export type ValidationSeverity = "error" | "warning";
export type ValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  message: string;
  hypothesisId?: string;
};

export type HypothesisAssessment = {
  hypothesisId: string;
  causalStatus: CausalStatus;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  activeSupportingEvidenceIds: string[];
  activeContradictingEvidenceIds: string[];
  missingEvidenceIds: string[];
  assumptions: string[];
  sourceReliability: SourceReliability;
  confounderNodeIds: string[];
  warnings: string[];
};

export type InterventionEligibility = {
  eligible: boolean;
  issues: ValidationIssue[];
  targetHypothesisIds: string[];
};

export type EvidenceChange = {
  investigation: Investigation;
  evidenceId: string;
  action: "challenge" | "withdraw" | "restore";
  reason: string;
  before: HypothesisAssessment[];
  after: HypothesisAssessment[];
};

export type SimulationInput = {
  scenarioId: string;
  controlId: string;
  seed: number;
  baselineLossCents: number;
  controlParameters: {
    interventionDelayMinutes: number;
    detectionLift: number;
    friction: number;
    sensitivityBps: number;
    seedVarianceBps: number;
  };
  assumptions: string[];
  inputHash: string;
};

export type SimulationResult = {
  scenarioId: string;
  controlId: string;
  seed: number;
  baselineLossCents: number;
  lossCents: number;
  avoidedLossCents: number;
  alertLeadMinutes: number;
  uncertaintyCents: { low: number; high: number };
  assumptions: string[];
  input: SimulationInput;
  simulated: true;
};

export type SimulationComparison = {
  baseline: SimulationResult;
  intervention: SimulationResult;
  differenceCents: number;
  sensitivityBps: number;
};
